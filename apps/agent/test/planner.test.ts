import { strict as assert } from "node:assert";
import { test } from "node:test";

import { planInstruments, CurrencyMismatch } from "../src/planner.js";
import type { AmountDue, AcceptedInstruments, Funding } from "../src/destination.js";

const due = (amountMinor: number): AmountDue => ({
  destinationId: "test",
  reference: "ref",
  amountMinor,
  currency: "CAD",
  description: "a test order",
  handle: "h",
});

const caps = (over: Partial<AcceptedInstruments> = {}): AcceptedInstruments => ({
  currency: "CAD",
  redeemsGiftCard: true,
  acceptsCard: true,
  ...over,
});

const gift = (hintMinor: number | null, verified = true) => ({
  code: "GC-TEST-0001",
  pin: "1234",
  hintMinor,
  verified,
});
const card = { token: "pm_card_visa", label: "Visa" };

test("gift drawn first, card takes the remainder", () => {
  const funding: Funding = { giftCard: gift(2000), card };
  const plan = planInstruments(due(7500), caps(), funding);
  assert.equal(plan.giftDrawMinor, 2000);
  assert.equal(plan.cardMinor, 5500);
  assert.equal(plan.uncoveredMinor, 0);
});

test("a gift card that covers everything leaves the card untouched", () => {
  const funding: Funding = { giftCard: gift(10000), card };
  const plan = planInstruments(due(7500), caps(), funding);
  assert.equal(plan.giftDrawMinor, 7500);
  assert.equal(plan.cardMinor, 0);
  assert.equal(plan.uncoveredMinor, 0);
});

test("an unknown gift balance plans no draw rather than guessing", () => {
  const funding: Funding = { giftCard: gift(null, false), card };
  const plan = planInstruments(due(7500), caps(), funding);
  assert.equal(plan.giftDrawMinor, 0);
  assert.equal(plan.cardMinor, 7500);
});

test("a zero-balance gift card is a valid $0 draw, not a failure", () => {
  const funding: Funding = { giftCard: gift(0), card };
  const plan = planInstruments(due(7500), caps(), funding);
  assert.equal(plan.giftDrawMinor, 0);
  assert.equal(plan.cardMinor, 7500);
  assert.equal(plan.uncoveredMinor, 0);
});

test("no card and a short gift card leaves the remainder uncovered, not silently dropped", () => {
  const funding: Funding = { giftCard: gift(2000), card: null };
  const plan = planInstruments(due(7500), caps({ acceptsCard: false }), funding);
  assert.equal(plan.giftDrawMinor, 2000);
  assert.equal(plan.cardMinor, 0);
  assert.equal(plan.uncoveredMinor, 5500);
});

test("a destination whose currency differs from the amount due is refused, not converted", () => {
  const funding: Funding = { giftCard: gift(2000), card };
  assert.throws(
    () => planInstruments(due(7500), caps({ currency: "USD" }), funding),
    CurrencyMismatch,
    "a USD destination must not draw a CAD gift card 1:1",
  );
});

test("a destination that does not accept a card plans no card leg", () => {
  const funding: Funding = { giftCard: gift(2000), card };
  const plan = planInstruments(due(7500), caps({ acceptsCard: false }), funding);
  assert.equal(plan.giftDrawMinor, 2000);
  assert.equal(plan.cardMinor, 0, "no card leg when the destination won't take one");
  assert.equal(plan.uncoveredMinor, 5500, "the remainder is surfaced as uncovered, not charged");
});

test("the mix always sums to the amount due", () => {
  for (const amount of [1, 99, 2000, 7500, 12345]) {
    for (const hint of [null, 0, 500, 2000, 999999]) {
      const plan = planInstruments(due(amount), caps(), { giftCard: gift(hint), card });
      assert.equal(
        plan.giftDrawMinor + plan.cardMinor + plan.uncoveredMinor,
        amount,
        `mix must sum to ${amount} (hint ${hint})`,
      );
    }
  }
});
