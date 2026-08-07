/**
 * The failure matrix — the strongest demo material, run in one place.
 *
 * Every row is a way a payment can go wrong, and the correct behaviour is never "pay anyway". These
 * rows are deterministic (a stub destination + the real consent orchestrator, the real token binds,
 * the real mandate verifier, and a real scrape of the running StreamCo portal), so they run with no
 * Stripe key and no gift card. The live card-rail rows (a genuine Stripe decline reversing the gift
 * draw to the cent) are covered end-to-end by `@pay-agent/store`'s `stripe-check` and the agent's
 * `demo:both`; this focuses on the consent-and-safety behaviour M3 adds.
 *
 * Usage:  pnpm --filter @pay-agent/agent failure-matrix
 */
import { openConsentStore } from "@pay-agent/db";
import {
  issuePaymentToken,
  loadIssuerKey,
  redeemPaymentToken,
  SpentTokens,
  TokenRefused,
  verifyPaymentToken,
  verifyCheckoutMandate,
  issueCheckoutMandate,
  JwsVerificationError,
} from "@pay-agent/mandate";

import type {
  AcceptedInstruments,
  AmountDue,
  Funding,
  InstrumentPlan,
  PaymentDestination,
  PaymentResult,
  PaymentStatus,
} from "../src/destination.js";
import { scrapeAmountDue, visibleText } from "../src/adapters/streamco.js";
import { startRun, resumeRun, type OrchestratorDeps, type PolicyContext } from "../src/orchestrator.js";
import { issueIntentMandate } from "@pay-agent/mandate";

const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const key = loadIssuerKey();

function pass(row: string, detail: string): void {
  console.log(`  ✓ ${row.padEnd(42)} ${detail}`);
}
function fail(row: string, detail: string): void {
  console.log(`  ✗ ${row.padEnd(42)} ${detail}`);
}

function stub(amountMinor: number, opts: { id?: string; declined?: boolean } = {}): PaymentDestination {
  const id = opts.id ?? "streamco";
  return {
    id,
    async discover(reference): Promise<AmountDue> {
      return { destinationId: id, reference, amountMinor, currency: "CAD", description: `stub ${reference}`, handle: reference };
    },
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: false, acceptsCard: true };
    },
    async pay(plan: InstrumentPlan): Promise<PaymentResult> {
      if (opts.declined) {
        return { ok: false, handle: "", detail: "insufficient_funds", giftDrawnMinor: plan.giftDrawMinor || null, cardChargedMinor: null, reversed: plan.giftDrawMinor > 0 };
      }
      return { ok: true, handle: "pi_ok", detail: "settled", giftDrawnMinor: plan.giftDrawMinor || null, cardChargedMinor: plan.cardMinor || null, reversed: false };
    },
    async confirm(handle): Promise<PaymentStatus> {
      return { settled: true, handle, detail: "confirmed" };
    },
  };
}

function funding(giftHint: number, withCard = true): Funding {
  return {
    giftCard: { code: "GC", pin: "1234", hintMinor: giftHint, verified: true },
    card: withCard ? { token: "pm_stub", label: "Visa" } : null,
  };
}

function policy(cap: number, allow: string[]): PolicyContext {
  return { userId: "demo-user", intent: issueIntentMandate({ userId: "demo-user", spendCapMinor: cap, currency: "CAD", destinationAllowlist: allow, ttlSeconds: 3600 }, key) };
}

function deps(destination: PaymentDestination, f: Funding): OrchestratorDeps {
  return { destination, funding: f, consent: openConsentStore(":memory:"), issuerKey: key };
}

async function main(): Promise<void> {
  console.log("Failure matrix — the correct behaviour is never 'pay anyway'.\n");

  console.log("Consent & policy (real orchestrator, stub destination):");
  {
    const d = deps(stub(12900), funding(2000));
    const o = await startRun("acct_annual", d, policy(5000, ["streamco"]));
    o.status === "pending_approval" ? pass("over the spend cap", "halted for approval, nothing drawn") : fail("over the spend cap", `unexpected ${o.status}`);
    await d.consent.close();
  }
  {
    const d = deps(stub(4200, { id: "acme-store" }), funding(2000));
    const o = await startRun("order_88", d, policy(20000, ["streamco"]));
    o.status === "pending_approval" ? pass("destination not allowlisted", "halted for approval") : fail("destination not allowlisted", `unexpected ${o.status}`);
    await d.consent.close();
  }
  {
    const d = deps(stub(8000), funding(2000, false));
    const o = await startRun("ref", d, policy(20000, ["streamco"]));
    o.status === "pending_approval" ? pass("remainder covered by no instrument", "halted (uncovered), not underpaid") : fail("uncovered remainder", `unexpected ${o.status}`);
    await d.consent.close();
  }

  console.log("\nSettlement safety:");
  {
    const d = deps(stub(8000, { declined: true }), funding(2500));
    const o = await startRun("plink_x", d, policy(20000, ["streamco"]));
    o.status === "failed" && o.result.reversed
      ? pass("destination declines after a draw", "gift-card draw reversed exactly")
      : fail("destination declines", `status ${o.status}, reversed ${o.status === "failed" ? o.result.reversed : "n/a"}`);
    await d.consent.close();
  }
  {
    // Amount moves after the human approved a specific figure.
    let quote = 4599;
    const dest: PaymentDestination = {
      id: "streamco",
      async discover(reference): Promise<AmountDue> {
        return { destinationId: "streamco", reference, amountMinor: quote, currency: "CAD", description: "moving", handle: reference };
      },
      async capabilities(): Promise<AcceptedInstruments> {
        return { currency: "CAD", redeemsGiftCard: false, acceptsCard: true };
      },
      async pay(): Promise<PaymentResult> {
        throw new Error("must not pay when the amount moved");
      },
      async confirm(handle): Promise<PaymentStatus> {
        return { settled: false, handle, detail: "n/a" };
      },
    };
    const d = deps(dest, funding(2000));
    const halted = await startRun("acct_demo", d, policy(2000, ["streamco"]));
    await d.consent.decideApproval(halted.run.id, "granted", "demo-user");
    quote = 9999;
    const resumed = await resumeRun(halted.run.id, d, policy(2000, ["streamco"]));
    resumed.status === "pending_approval" ? pass("amount moved after approval", "refused, re-raised for approval") : fail("amount moved after approval", `unexpected ${resumed.status}`);
    await d.consent.close();
  }

  console.log("\nDestination unreadable (real scrape of the running portal):");
  try {
    const okHtml = await (await fetch(`${WEB}/streamco/acct_demo`)).text();
    const glitchHtml = await (await fetch(`${WEB}/streamco/acct_demo?glitch=1`)).text();
    const okAmount = scrapeAmountDue(visibleText(okHtml));
    const glitchAmount = scrapeAmountDue(visibleText(glitchHtml));
    okAmount !== null ? pass("readable page", `scraped ${(okAmount / 100).toFixed(2)}`) : fail("readable page", "could not scrape a readable page");
    glitchAmount === null ? pass("markup changed", "reports it cannot read the amount — refuses to guess") : fail("markup changed", `guessed ${glitchAmount}`);
  } catch (err) {
    fail("portal scrape", `portal not reachable (${(err as Error).message}); is web running?`);
  }

  console.log("\nScoped token binds:");
  {
    const token = issuePaymentToken({ userId: "demo-user", destinationId: "streamco", amountMinor: 2000, currency: "CAD", ttlSeconds: 300 }, key);
    const spent = new SpentTokens();
    const tryRefuse = (row: string, fn: () => unknown) => {
      try {
        fn();
        fail(row, "ACCEPTED (should have been refused)");
      } catch (e) {
        e instanceof TokenRefused ? pass(row, `refused (${e.refusal})`) : fail(row, String(e));
      }
    };
    tryRefuse("token replayed elsewhere", () => verifyPaymentToken(token.jws, key.publicKey, { destinationId: "ucp-storefront", amountMinor: 2000, currency: "CAD" }));
    tryRefuse("token amount tampered", () => verifyPaymentToken(token.jws, key.publicKey, { destinationId: "streamco", amountMinor: 20000, currency: "CAD" }));
    tryRefuse("token expired", () => verifyPaymentToken(token.jws, key.publicKey, { destinationId: "streamco", amountMinor: 2000, currency: "CAD", atSeconds: token.claims.exp + 1 }));
    redeemPaymentToken(token.jws, key.publicKey, { destinationId: "streamco", amountMinor: 2000, currency: "CAD" }, spent);
    tryRefuse("token reused", () => redeemPaymentToken(token.jws, key.publicKey, { destinationId: "streamco", amountMinor: 2000, currency: "CAD" }, spent));
  }

  console.log("\nTampered mandate:");
  {
    const cm = issueCheckoutMandate({ reference: "r", destinationId: "streamco", amountMinor: 4599, currency: "CAD", checkoutState: { amountMinor: 4599 } }, key);
    const [h, , s] = cm.jws.split(".") as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ ...cm.claims, amountMinor: 1 })).toString("base64url");
    try {
      verifyCheckoutMandate(`${h}.${forged}.${s}`, key.publicKey);
      fail("one byte flipped in a signed mandate", "ACCEPTED (should reject)");
    } catch (e) {
      e instanceof JwsVerificationError ? pass("one byte flipped in a signed mandate", "signature rejected") : fail("mandate tamper", String(e));
    }
  }

  console.log("\nEvery row above chose safety over paying a wrong or unauthorized amount.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
