/**
 * Verifies the M3 consent orchestrator against a stub destination — no store, no Stripe.
 *
 * The stub lets us exercise the whole consent flow deterministically: the policy gate halting an
 * over-cap or non-allowlisted run with nothing drawn, the approval → resume path settling it, the
 * signed mandates being issued and recorded, and the append-only trail capturing every step.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { openConsentStore } from "@pay-agent/db";
import { issueIntentMandate, loadIssuerKey } from "@pay-agent/mandate";

import type {
  AcceptedInstruments,
  AmountDue,
  Funding,
  InstrumentPlan,
  Mandate,
  PaymentDestination,
  PaymentResult,
  PaymentStatus,
} from "../src/destination.js";
import { startRun, resumeRun, type OrchestratorDeps, type PolicyContext } from "../src/orchestrator.js";

const issuerKey = loadIssuerKey({});

/** A destination that records what it was asked to pay, so we can assert nothing settled early. */
function stubDestination(amountMinor: number, id = "streamco"): PaymentDestination & { paid: InstrumentPlan[] } {
  const paid: InstrumentPlan[] = [];
  return {
    id,
    paid,
    async discover(reference: string): Promise<AmountDue> {
      return { destinationId: id, reference, amountMinor, currency: "CAD", description: `stub ${reference}`, handle: reference };
    },
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: false, acceptsCard: true };
    },
    async pay(plan: InstrumentPlan, mandate: Mandate): Promise<PaymentResult> {
      paid.push(plan);
      assert.equal(mandate.signed, true, "the orchestrator must pass a signed mandate");
      assert.ok(mandate.jws, "a signed mandate carries the PaymentMandate JWS");
      return {
        ok: true,
        handle: "stub_ok",
        detail: "settled on stub",
        giftDrawnMinor: plan.giftDrawMinor > 0 ? plan.giftDrawMinor : null,
        cardChargedMinor: plan.cardMinor > 0 ? plan.cardMinor : null,
        reversed: false,
      };
    },
    async confirm(handle: string): Promise<PaymentStatus> {
      return { settled: true, handle, detail: "stub confirmed" };
    },
  };
}

const funding: Funding = {
  giftCard: { code: "GC-TEST", pin: "1234", hintMinor: 2000, verified: true },
  card: { token: "pm_stub", label: "Visa •••• 4242" },
};

function deps(destination: PaymentDestination): OrchestratorDeps {
  return { destination, funding, consent: openConsentStore(":memory:"), issuerKey };
}

function policyWith(spendCapMinor: number, allowlist: string[]): PolicyContext {
  return {
    userId: "demo-user",
    intent: issueIntentMandate({ userId: "demo-user", spendCapMinor, currency: "CAD", destinationAllowlist: allowlist, ttlSeconds: 3600 }, issuerKey),
  };
}

test("a within-policy run settles and records the whole audit trail", async () => {
  const dest = stubDestination(4599);
  const d = deps(dest);
  const outcome = await startRun("acct_demo", d, policyWith(10000, ["streamco"]));

  assert.equal(outcome.status, "settled");
  assert.equal(dest.paid.length, 1);
  assert.equal(dest.paid[0]!.giftDrawMinor, 2000);
  assert.equal(dest.paid[0]!.cardMinor, 2599);

  const events = await d.consent.eventsForRun(outcome.run.id);
  const kinds = events.map((e) => e.kind);
  for (const expected of ["discovered", "policy_passed", "mandate_issued", "mandate_verified", "planned", "paid", "confirmed"]) {
    assert.ok(kinds.includes(expected as never), `trail should include "${expected}" (got ${kinds.join(",")})`);
  }
  const mandates = await d.consent.mandatesForRun(outcome.run.id);
  assert.deepEqual(mandates.map((m) => m.kind).sort(), ["CheckoutMandate", "IntentMandate", "PaymentMandate"]);
  await d.consent.close();
});

test("an over-cap run halts for approval with nothing paid", async () => {
  const dest = stubDestination(4599);
  const d = deps(dest);
  const outcome = await startRun("acct_demo", d, policyWith(2000, ["streamco"]));

  assert.equal(outcome.status, "pending_approval");
  assert.equal(dest.paid.length, 0, "nothing may be paid before approval");
  const approval = await d.consent.getApproval(outcome.run.id);
  assert.equal(approval?.status, "pending");
  assert.deepEqual([...approval!.reasons], ["over_cap"]);
  await d.consent.close();
});

test("a non-allowlisted destination halts for approval", async () => {
  const dest = stubDestination(1000, "unknown-dest");
  const d = deps(dest);
  const outcome = await startRun("ref", d, policyWith(10000, ["streamco"]));
  assert.equal(outcome.status, "pending_approval");
  const approval = await d.consent.getApproval(outcome.run.id);
  assert.deepEqual([...approval!.reasons], ["destination_not_allowlisted"]);
  await d.consent.close();
});

test("approve then resume settles the previously-halted run", async () => {
  const dest = stubDestination(4599);
  const d = deps(dest);
  const policy = policyWith(2000, ["streamco"]);
  const halted = await startRun("acct_demo", d, policy);
  assert.equal(halted.status, "pending_approval");

  await d.consent.decideApproval(halted.run.id, "granted", "demo-user");
  const resumed = await resumeRun(halted.run.id, d, policy);
  assert.equal(resumed.status, "settled");
  assert.equal(dest.paid.length, 1);
  await d.consent.close();
});

test("resume refuses when the amount moved after approval", async () => {
  // Approve at 4599, then have the destination quote a different amount on resume.
  let quote = 4599;
  const dest: PaymentDestination = {
    id: "streamco",
    async discover(reference: string): Promise<AmountDue> {
      return { destinationId: "streamco", reference, amountMinor: quote, currency: "CAD", description: "moving", handle: reference };
    },
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: false, acceptsCard: true };
    },
    async pay(): Promise<PaymentResult> {
      throw new Error("must not pay when the amount moved");
    },
    async confirm(handle: string): Promise<PaymentStatus> {
      return { settled: false, handle, detail: "n/a" };
    },
  };
  const d = deps(dest);
  const policy = policyWith(2000, ["streamco"]);
  const halted = await startRun("acct_demo", d, policy);
  await d.consent.decideApproval(halted.run.id, "granted", "demo-user");

  quote = 9999; // the bill moved after the human agreed to 4599
  const resumed = await resumeRun(halted.run.id, d, policy);
  assert.equal(resumed.status, "pending_approval");
  await d.consent.close();
});
