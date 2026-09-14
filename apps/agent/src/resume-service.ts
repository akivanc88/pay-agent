/**
 * Resuming an approved run — the other half of the human-in-the-loop.
 *
 * When a person approves a halted run in the dashboard, something has to actually finish paying it.
 * That "something" is the agent, not the web app: only the agent holds the Stripe key and knows how
 * to reach each destination. So the dashboard's approve endpoint calls this over HTTP (see
 * `scripts/serve.ts`), and here we reconstruct the *real* destination adapter for the run and settle
 * it through the same consent orchestrator that would have settled it inline.
 *
 * Two honest constraints:
 *  - Funding is not persisted on a run (a gift code is a credential; we don't store it), and a run
 *    that halted at the policy gate drew nothing — so resume settles with a fresh **demo wallet**: a
 *    just-issued closed-loop gift card plus a Stripe test card. Stated plainly, not hidden.
 *  - Seed/demo runs whose destination has no live adapter (e.g. `acme-store`) cannot be auto-settled;
 *    the approval is still recorded, and this reports that it cannot finish them.
 */
import type { ConsentStore } from "@pay-agent/db";
import { issueIntentMandate, type IssuerKey } from "@pay-agent/mandate";

import { stripePaymentLink } from "./adapters/payment-link.js";
import { streamco } from "./adapters/streamco.js";
import { ucpStorefront } from "./adapters/ucp-storefront.js";
import type { Funding, PaymentDestination } from "./destination.js";
import { formatMinor } from "./money.js";
import { resumeRun } from "./orchestrator.js";

export interface ResumeEnv {
  readonly storeUrl: string;
  readonly webUrl: string;
  readonly stripeSecretKey: string | undefined;
}

export function resumeEnv(env: NodeJS.ProcessEnv = process.env): ResumeEnv {
  return {
    storeUrl: env.STORE_URL ?? "http://localhost:3000",
    webUrl: env.WEB_URL ?? "http://localhost:3001",
    stripeSecretKey: env.STRIPE_SECRET_KEY,
  };
}

/** Rebuild the live adapter for a run's destination, or null when there is no live one. */
export function reconstructDestination(destinationId: string, env: ResumeEnv): PaymentDestination | null {
  switch (destinationId) {
    case "ucp-storefront":
      return ucpStorefront({ baseUrl: env.storeUrl });
    case "stripe-payment-link":
      return env.stripeSecretKey
        ? stripePaymentLink({ secretKey: env.stripeSecretKey, storeBaseUrl: env.storeUrl })
        : null;
    case "streamco":
      return env.stripeSecretKey
        ? streamco({ secretKey: env.stripeSecretKey, storeBaseUrl: env.storeUrl, webBaseUrl: env.webUrl })
        : null;
    default:
      return null;
  }
}

const SIMULATION_SECRET = process.env["SIMULATION_SECRET"] || "super-secret-sim-key";

/**
 * Issue a fresh demo gift card and pair it with a Stripe test card — the resume-time demo wallet.
 *
 * Over the store's HTTP API, not a shelled-out `pnpm issue-card` against the local filesystem — the
 * same "agent and store are separate deployed services, not one laptop" fix as `issueDemoCard` in
 * `brain/demo-support.ts`. This call site hit the exact same bug independently (a real "Resume
 * errored: Command failed: pnpm issue-card ..." in production), because it's a second, separate
 * function that happened to do the identical wrong thing rather than share the fixed one.
 */
async function demoFunding(amountMinor: number, storeUrl: string): Promise<Funding> {
  const giftMinor = Math.min(2000, amountMinor); // a real split when the bill exceeds $20
  const code = `GC-RESUME-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const pin = "1234";
  const res = await fetch(`${storeUrl}/testing/issue-card`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Simulation-Secret": SIMULATION_SECRET },
    body: JSON.stringify({ code, pin, dollars: giftMinor / 100 }),
  });
  if (!res.ok) {
    throw new Error(`demoFunding: store refused (${res.status}): ${await res.text()}`);
  }
  return {
    giftCard: { code, pin, hintMinor: giftMinor, verified: true },
    card: { token: "pm_card_visa", label: "Visa (test)", enrolledBalanceMinor: null },
  };
}

export interface ResumeResult {
  readonly ok: boolean;
  readonly status: string;
  readonly detail: string;
}

/**
 * A human-safe "what was paid" sentence, built from the amounts a settled `PaymentResult` carries —
 * never the adapter's own `result.detail`, which is written for logs and can carry minor-unit
 * integers or internal jargon (e.g. a raw "settled 2599 …"). Mirrors the orchestrator's own
 * `paidSummary` (`orchestrator.ts`'s `settle()`), which a chat-approval surface has no way to reach.
 */
function paidSummary(result: { giftDrawnMinor: number | null; cardChargedMinor: number | null }, currency: string): string {
  const parts: string[] = [];
  if (result.giftDrawnMinor && result.giftDrawnMinor > 0) parts.push(`${formatMinor(result.giftDrawnMinor, currency)} gift card`);
  if (result.cardChargedMinor && result.cardChargedMinor > 0) parts.push(`${formatMinor(result.cardChargedMinor, currency)} card`);
  return parts.length > 0 ? `Paid — ${parts.join(" + ")}.` : "Paid — the gift card covered it in full.";
}

/**
 * Resume and settle an approved run against its real destination.
 *
 * `standingAuth` carries the human's explicit "trust this destination going forward" choice from the
 * approval UI. It is threaded here from the dashboard, never from the model — the brain's tool surface
 * has no way to set it — and `resumeRun` only honours it once a human's grant is on record.
 */
export async function resumeAndSettle(
  runId: string,
  consent: ConsentStore,
  issuerKey: IssuerKey,
  env: ResumeEnv,
  standingAuth = false,
): Promise<ResumeResult> {
  const run = await consent.getRun(runId);
  if (!run) return { ok: false, status: "unknown", detail: `no such run ${runId}` };

  const destination = reconstructDestination(run.destinationId, env);
  if (!destination) {
    const why = env.stripeSecretKey
      ? `destination "${run.destinationId}" has no live adapter (a seed/demo run) — approval recorded, but it cannot be auto-settled`
      : `no Stripe test key configured, so "${run.destinationId}" cannot be settled here`;
    await consent.appendEvent(runId, "info", `Resume skipped: ${why}`);
    return { ok: false, status: run.status, detail: why };
  }

  try {
    const funding = await demoFunding(run.amountMinor, env.storeUrl);
    // resumeRun does not re-decide policy (a human already approved); a minimal intent satisfies the
    // signature and is never used to gate anything here.
    const intent = issueIntentMandate(
      { userId: run.userId, spendCapMinor: run.amountMinor, currency: run.currency, destinationAllowlist: [run.destinationId], ttlSeconds: 600 },
      issuerKey,
    );
    const outcome = await resumeRun(
      runId,
      { destination, funding, consent, issuerKey },
      { userId: run.userId, intent },
      { grantStandingAuth: standingAuth },
    );
    const detail =
      outcome.status === "settled"
        ? paidSummary(outcome.result, run.currency)
        : outcome.status === "pending_approval"
          ? `still pending: ${outcome.detail}`
          : `did not settle (${outcome.status})`;
    return { ok: outcome.status === "settled", status: outcome.status, detail };
  } catch (err) {
    const detail = (err as Error).message;
    await consent.appendEvent(runId, "info", `Resume errored: ${detail}`);
    return { ok: false, status: "error", detail };
  }
}
