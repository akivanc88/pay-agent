/**
 * Characterizes the Agent Console's narration copy — every sentence must be derivable from the
 * tool's own `data`, never invented, and never rely on a real model producing prose. Fixture strings
 * for `explainPending` are copied verbatim from the real templates in
 * `apps/agent/src/orchestrator.ts`'s `evaluatePolicy()`/`resumeRun()`, not paraphrased.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  destinationDescription,
  explainGetRun,
  explainPending,
  failedFootnote,
  intentFootnote,
  settledFootnote,
} from "../components/agent-console-narration";

test("intentFootnote states the model-proposes/system-enforces split, plainly", () => {
  assert.match(intentFootnote({}), /the payment system itself locks it in/);
  assert.doesNotMatch(intentFootnote({}), /clamp|mandate|allowlist|deterministic core/i);
});

test("intentFootnote prefixes the clamp explanation only when clamped", () => {
  const clamped = intentFootnote({ clamped: true });
  const notClamped = intentFootnote({ clamped: false });
  assert.match(clamped, /automatically lowered/);
  assert.doesNotMatch(notClamped, /automatically lowered/);
});

test("settledFootnote explains gift-first-then-card when both legs are drawn", () => {
  assert.match(
    settledFootnote({ giftDrawnMinor: 2000, cardChargedMinor: 2599 })!,
    /gift card was used first.*card paid the small remainder/,
  );
});

test("settledFootnote says the card was never touched when the gift card covered it all", () => {
  assert.match(settledFootnote({ giftDrawnMinor: 3500, cardChargedMinor: 0 })!, /card was never touched/);
});

test("settledFootnote says there was no gift balance when only the card was charged", () => {
  assert.match(settledFootnote({ giftDrawnMinor: 0, cardChargedMinor: 3500 })!, /no gift-card balance available/);
});

test("settledFootnote renders nothing when there is no split to explain", () => {
  assert.equal(settledFootnote({ giftDrawnMinor: 0, cardChargedMinor: 0 }), null);
});

test("explainPending classifies the over-cap template", () => {
  assert.match(
    explainPending("CAD 45.99 exceeds the CAD 20.00 spend cap"),
    /amount is more than you authorized/,
  );
});

test("explainPending classifies the cumulative-cap template", () => {
  const detail =
    "CAD 30.00 would bring spending under this authorization to CAD 220.00, over the CAD 200.00 cumulative cap (already CAD 190.00 settled)";
  assert.match(explainPending(detail), /push your total spending over the budget you set/);
});

test("explainPending classifies the allowlist template", () => {
  assert.match(
    explainPending('destination "ucp-storefront" is not on the intent\'s allowlist'),
    /hadn't approved this destination yet/,
  );
});

test("explainPending classifies the uncovered-instrument template", () => {
  assert.match(
    explainPending("CAD 12.00 is covered by no instrument the agent holds"),
    /none of your payment methods can cover the full amount/,
  );
});

test("explainPending classifies the currency-mismatch template", () => {
  assert.match(explainPending("owed in USD, intent authorizes CAD"), /different currency than you authorized/);
});

test("explainPending classifies the amount-changed-on-resume template", () => {
  assert.match(
    explainPending("amount changed from CAD 45.99 to CAD 50.00 after approval"),
    /amount changed since you last reviewed it/,
  );
});

test("explainPending classifies the still-awaiting-a-decision template", () => {
  assert.equal(explainPending("still awaiting a human decision"), "This is waiting on you — no one has approved it yet.");
});

test("explainPending joins multiple tripped checks with 'and'", () => {
  const detail = 'CAD 45.99 exceeds the CAD 20.00 spend cap; destination "ucp-storefront" is not on the intent\'s allowlist';
  const result = explainPending(detail);
  assert.match(result, /amount is more than you authorized/);
  assert.match(result, /hadn't approved this destination yet/);
  assert.match(result, / and /);
});

test("explainPending never guesses at an unrecognized template", () => {
  assert.equal(explainPending("some future policy note nobody wrote a case for"), "This paused as a safety check before anything was paid.");
});

test("failedFootnote only claims a reversal when the data confirms one", () => {
  assert.match(failedFootnote({ reversed: true })!, /given back — you didn't lose anything/);
  assert.equal(failedFootnote({ reversed: false }), null);
  assert.equal(failedFootnote({}), null);
});

test("explainGetRun distinguishes pending approval, granted approval, and terminal run states", () => {
  assert.match(explainGetRun({ approvalStatus: "pending", run: { status: "pending_approval" } }), /nothing changes until you approve/);
  assert.match(explainGetRun({ approvalStatus: "granted", run: { status: "approved" } }), /resuming is the last step/);
  assert.match(explainGetRun({ approvalStatus: null, run: { status: "settled" } }), /already finished/);
  assert.match(explainGetRun({ approvalStatus: null, run: { status: "failed" } }), /already failed \(and was reversed\)/);
  assert.match(explainGetRun({ approvalStatus: null, run: { status: "open" } }), /never moves money/);
});

test("destinationDescription gives a plain, non-jargon description for known destinations", () => {
  assert.match(destinationDescription({ id: "streamco", label: "StreamCo subscription bill" }), /read the amount off the page itself/);
  assert.match(destinationDescription({ id: "ucp-storefront", label: "the flower shop" }), /take your gift card directly/);
  assert.match(destinationDescription({ id: "stripe-payment-link", label: "a Stripe payment link" }), /payment link from an outside site/);
});

test("destinationDescription falls back to the label alone for an unrecognized id, never invents", () => {
  assert.equal(destinationDescription({ id: "future-destination", label: "Some New Merchant" }), "Some New Merchant");
});
