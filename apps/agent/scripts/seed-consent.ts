/**
 * Seed the consent store with a realistic set of runs, for the dashboard and the demo.
 *
 * These are produced by the *real* orchestrator against a stub destination, so the runs, the
 * append-only trail and the signed mandates are all genuine — only the destination's HTTP/Stripe
 * calls are stubbed out, which is what lets this run with no store and no Stripe key. It writes to the
 * shared consent database (the same file the web dashboard reads) and starts fresh each time.
 *
 * Usage:  pnpm --filter @pay-agent/agent seed-consent
 */
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { openConsentStore } from "@pay-agent/db";
import { issueIntentMandate, loadIssuerKey } from "@pay-agent/mandate";

import type {
  AcceptedInstruments,
  AmountDue,
  Funding,
  InstrumentPlan,
  PaymentDestination,
  PaymentResult,
  PaymentStatus,
} from "../src/destination.js";
import { startRun, type OrchestratorDeps, type PolicyContext } from "../src/orchestrator.js";

const consentPath =
  process.env.CONSENT_DB_PATH ?? fileURLToPath(new URL("../../web/.data/consent.db", import.meta.url));

const issuerKey = loadIssuerKey();

interface StubOpts {
  readonly id: string;
  readonly amountMinor: number;
  readonly description: string;
  readonly result?: "ok" | "declined";
}

function stub(opts: StubOpts): PaymentDestination {
  return {
    id: opts.id,
    async discover(reference: string): Promise<AmountDue> {
      return { destinationId: opts.id, reference, amountMinor: opts.amountMinor, currency: "CAD", description: opts.description, handle: reference };
    },
    async capabilities(): Promise<AcceptedInstruments> {
      // The storefront redeems the gift card itself; everything else is an external rail.
      const redeemsGiftCard = opts.id === "ucp-storefront";
      return { currency: "CAD", redeemsGiftCard, acceptsCard: true };
    },
    async pay(plan: InstrumentPlan): Promise<PaymentResult> {
      if (opts.result === "declined") {
        return {
          ok: false,
          handle: "",
          detail: "Your card was declined (insufficient_funds).",
          giftDrawnMinor: plan.giftDrawMinor > 0 ? plan.giftDrawMinor : null,
          cardChargedMinor: null,
          reversed: plan.giftDrawMinor > 0,
        };
      }
      return {
        ok: true,
        handle: `pi_seed_${opts.id}`,
        detail: plan.cardMinor > 0 ? `settled ${plan.cardMinor} on the card` : "gift card covered the whole bill",
        giftDrawnMinor: plan.giftDrawMinor > 0 ? plan.giftDrawMinor : null,
        cardChargedMinor: plan.cardMinor > 0 ? plan.cardMinor : null,
        reversed: false,
      };
    },
    async confirm(handle: string): Promise<PaymentStatus> {
      return { settled: true, handle, detail: "confirmed with the destination" };
    },
  };
}

function funding(giftHintMinor: number): Funding {
  return {
    giftCard: { code: "GC-DEMO-0001", pin: "1234", hintMinor: giftHintMinor, verified: true },
    card: { token: "pm_seed_visa", label: "Visa •••• 4242" },
  };
}

function policy(spendCapMinor: number, allowlist: string[]): PolicyContext {
  return {
    userId: "demo-user",
    intent: issueIntentMandate({ userId: "demo-user", spendCapMinor, currency: "CAD", destinationAllowlist: allowlist, ttlSeconds: 86_400 }, issuerKey),
  };
}

async function main() {
  // Start fresh so a reseed is deterministic.
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${consentPath}${suffix}`, { force: true });

  const consent = openConsentStore(consentPath);
  const allowlist = ["ucp-storefront", "stripe-payment-link", "streamco"];
  const base = (destination: PaymentDestination, giftHint: number): OrchestratorDeps => ({
    destination,
    funding: funding(giftHint),
    consent,
    issuerKey,
  });

  // 1. A settled storefront split — the gift card covered it all.
  await startRun("cs_flowers_01", base(stub({ id: "ucp-storefront", amountMinor: 3000, description: "Fernbank & Co cart cs_flowers_01" }), 5000), policy(20000, allowlist));

  // 2. A settled StreamCo split — gift $20.00 + card $25.99.
  await startRun("acct_demo", base(stub({ id: "streamco", amountMinor: 4599, description: "StreamCo account acct_demo" }), 2000), policy(20000, allowlist));

  // 3. A declined card on a payment link — the gift draw was reversed exactly.
  await startRun("plink_seed_decline", base(stub({ id: "stripe-payment-link", amountMinor: 8000, description: "Stripe payment link plink_seed", result: "declined" }), 2500), policy(20000, allowlist));

  // 4. Over the spend cap — halted, waiting in the approval inbox.
  await startRun("acct_annual", base(stub({ id: "streamco", amountMinor: 12900, description: "StreamCo annual plan acct_annual" }), 2000), policy(5000, allowlist));

  // 5. A destination the user never allowlisted — halted, a different approval reason.
  await startRun("order_acme_88", base(stub({ id: "acme-store", amountMinor: 4200, description: "Acme Store order order_acme_88" }), 2000), policy(20000, allowlist));

  const runs = await consent.listRuns();
  const pending = await consent.listApprovals("pending");
  console.log(`Seeded ${runs.length} runs into ${consentPath}`);
  for (const r of runs) console.log(`  ${r.status.padEnd(16)} ${r.destinationId.padEnd(20)} ${(r.amountMinor / 100).toFixed(2)} ${r.currency}  ${r.description}`);
  console.log(`${pending.length} awaiting approval.`);
  await consent.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
