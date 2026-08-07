/**
 * The brain — M4 — driven end to end with the deterministic scripted model and a stub destination.
 *
 * No network, no Stripe, no running servers: the scripted brain reasons over the instruction, and a
 * stub adapter injected through `resolveDestination` stands in for StreamCo. What we prove is the
 * whole safety argument in miniature — the brain drives the *same* consent orchestrator the scripted
 * demos do, and it can never move more than the human authorized:
 *
 *  - a within-cap instruction settles, drawing gift-first then card, through the full mandate flow;
 *  - an under-cap instruction halts for approval with NOTHING drawn — the model cannot force it;
 *  - the model never signs the intent (the core does) and never sees a credential;
 *  - a runaway cap is clamped to the ceiling the model cannot raise.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { openConsentStore } from "@pay-agent/db";
import { loadIssuerKey } from "@pay-agent/mandate";

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
import { BrainSession, drive, scriptedBrain, type BrainToolContext } from "../src/brain/index.js";
import { resumeEnv } from "../src/resume-service.js";

const issuerKey = loadIssuerKey({});

/** A StreamCo stand-in that records what it was asked to pay, so we can assert nothing settled early. */
function stubStreamco(amountMinor: number): PaymentDestination & { paid: InstrumentPlan[] } {
  const paid: InstrumentPlan[] = [];
  return {
    id: "streamco",
    paid,
    async discover(reference: string): Promise<AmountDue> {
      return { destinationId: "streamco", reference, amountMinor, currency: "CAD", description: `StreamCo ${reference}`, handle: reference };
    },
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: false, acceptsCard: true };
    },
    async pay(plan: InstrumentPlan, mandate: Mandate): Promise<PaymentResult> {
      paid.push(plan);
      assert.equal(mandate.signed, true, "the brain must drive the signed-mandate rails");
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

function context(dest: PaymentDestination, overrides: Partial<BrainToolContext> = {}): BrainToolContext {
  return {
    userId: "demo-user",
    consent: openConsentStore(":memory:"),
    issuerKey,
    env: resumeEnv({}),
    wallet: () => funding,
    maxCapMinor: 20000,
    resolveDestination: (id) => (id === dest.id ? dest : null),
    ...overrides,
  };
}

test("a within-cap instruction settles gift-first through the full mandate flow", async () => {
  const dest = stubStreamco(4599);
  const ctx = context(dest);
  const session = new BrainSession(ctx);

  const result = await drive("Pay my StreamCo bill from my gift card, up to $50", scriptedBrain(), session);

  assert.equal(result.live, false, "the scripted brain must report itself as not a real model");
  assert.equal(dest.paid.length, 1, "exactly one settlement");
  assert.equal(dest.paid[0]!.giftDrawMinor, 2000, "gift card drawn first");
  assert.equal(dest.paid[0]!.cardMinor, 2599, "remainder on the card");
  assert.match(result.final, /45\.99/, "the closing message states the amount paid");
  assert.match(result.final, /gift card/i);

  // The model drafted an intent but did NOT sign it — the core did (a real EdDSA JWS is present).
  const intent = session.draftedIntent;
  assert.ok(intent?.jws, "the core signed an IntentMandate");
  assert.equal(intent!.claims.spendCapMinor, 5000, "the $50 cap was transcribed to 5000 minor units");

  await ctx.consent.close();
});

test("an under-cap instruction halts for approval with nothing drawn — the model cannot force it", async () => {
  const dest = stubStreamco(4599);
  const ctx = context(dest);
  const session = new BrainSession(ctx);

  const result = await drive("Pay my StreamCo bill from my gift card, up to $20", scriptedBrain(), session);

  assert.equal(dest.paid.length, 0, "NOTHING may be drawn before a human approves");
  assert.match(result.final, /paused|approv|inbox/i, "the brain explains the pause rather than forcing it");

  const runId = session.startedRuns[0]!;
  const approval = await ctx.consent.getApproval(runId);
  assert.equal(approval?.status, "pending");
  assert.deepEqual([...approval!.reasons], ["over_cap"]);

  await ctx.consent.close();
});

test("a runaway drafted cap is clamped to the ceiling the model cannot raise", async () => {
  const dest = stubStreamco(4599);
  const ctx = context(dest, { maxCapMinor: 3000 }); // ceiling below the $50 the instruction asks for
  const session = new BrainSession(ctx);

  await drive("Pay my StreamCo bill, up to $500", scriptedBrain(), session);

  assert.equal(session.draftedIntent!.claims.spendCapMinor, 3000, "cap clamped to the ceiling");
  // With a $30 ceiling and a $45.99 bill, the gate must halt — the clamp cannot be exceeded.
  const runId = session.startedRuns[0]!;
  const run = await ctx.consent.getRun(runId);
  assert.equal(run!.status, "pending_approval");
  assert.equal(dest.paid.length, 0);

  await ctx.consent.close();
});

test("start_run without a drafted intent is refused by the box, not the model", async () => {
  const dest = stubStreamco(4599);
  const ctx = context(dest);
  const session = new BrainSession(ctx);

  // Drive the tool directly, skipping draft_intent — the executor must refuse.
  const trace = await session.execute({ id: "c1", name: "start_run", arguments: { destinationId: "streamco", reference: "acct_demo" } });
  assert.equal(trace.ok, false);
  assert.match(trace.result, /draft_intent first/);
  assert.equal(dest.paid.length, 0);

  await ctx.consent.close();
});
