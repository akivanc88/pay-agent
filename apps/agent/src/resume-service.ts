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
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ConsentStore } from "@pay-agent/db";
import { issueIntentMandate, type IssuerKey } from "@pay-agent/mandate";

import { stripePaymentLink } from "./adapters/payment-link.js";
import { streamco } from "./adapters/streamco.js";
import { ucpStorefront } from "./adapters/ucp-storefront.js";
import type { Funding, PaymentDestination } from "./destination.js";
import { resumeRun } from "./orchestrator.js";

const storeDir = join(dirname(fileURLToPath(import.meta.url)), "../../store");

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

/** Issue a fresh demo gift card and pair it with a Stripe test card — the resume-time demo wallet. */
function demoFunding(amountMinor: number): Funding {
  const giftMinor = Math.min(2000, amountMinor); // a real split when the bill exceeds $20
  const code = `GC-RESUME-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  execFileSync("pnpm", ["issue-card", code, "1234", (giftMinor / 100).toFixed(2)], {
    cwd: storeDir,
    stdio: "ignore",
  });
  return {
    giftCard: { code, pin: "1234", hintMinor: giftMinor, verified: true },
    card: { token: "pm_card_visa", label: "Visa (test)" },
  };
}

export interface ResumeResult {
  readonly ok: boolean;
  readonly status: string;
  readonly detail: string;
}

/** Resume and settle an approved run against its real destination. */
export async function resumeAndSettle(
  runId: string,
  consent: ConsentStore,
  issuerKey: IssuerKey,
  env: ResumeEnv,
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
    const funding = demoFunding(run.amountMinor);
    // resumeRun does not re-decide policy (a human already approved); a minimal intent satisfies the
    // signature and is never used to gate anything here.
    const intent = issueIntentMandate(
      { userId: run.userId, spendCapMinor: run.amountMinor, currency: run.currency, destinationAllowlist: [run.destinationId], ttlSeconds: 600 },
      issuerKey,
    );
    const outcome = await resumeRun(runId, { destination, funding, consent, issuerKey }, { userId: run.userId, intent });
    const detail =
      outcome.status === "settled"
        ? `settled (${outcome.result.detail})`
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
