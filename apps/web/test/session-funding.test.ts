/**
 * Characterizes the checkout UI's funding projection and last-four matching policy.
 * Unknown balances stay unknown even though a fallback card can make the payment coverable.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInstruments,
  buildPlan,
  planFallsShort,
  resolveGiftCard,
} from "../app/(pay)/checkout/session-funding";
import type { FundingCard } from "../app/(pay)/checkout/session-types";

const closedLoop = (id: string, last4: string): FundingCard => ({
  family: "closed_loop",
  id,
  last4,
  balance_display: "$25.00",
  balance_verified: true,
  balance_stale: false,
});

test("known gift balance is drawn first and leaves only the remainder to the card", () => {
  assert.deepEqual(
    buildPlan({ due: 7500, giftBalance: 2500, hasGift: true, hasCard: true }),
    {
      due: 7500,
      giftDraw: 2500,
      cardAmount: 5000,
      uncovered: 0,
      hasGift: true,
      hasCard: true,
    },
  );
});

test("unknown gift balance remains undisclosed while a fallback card makes the plan coverable", () => {
  const plan = buildPlan({ due: 7500, giftBalance: null, hasGift: true, hasCard: true });
  assert.equal(plan.giftDraw, null);
  assert.equal(plan.cardAmount, null);
  assert.equal(plan.uncovered, 0);
  assert.equal(planFallsShort(plan), false);
});

test("a known gift-only shortfall is rejected before payment", () => {
  const plan = buildPlan({ due: 7500, giftBalance: 2500, hasGift: true, hasCard: false });
  assert.equal(plan.giftDraw, 2500);
  assert.equal(plan.uncovered, 5000);
  assert.equal(planFallsShort(plan), true);
});

test("last-four matching distinguishes one card, no card, and ambiguity", () => {
  const cards = [closedLoop("one", "0001"), closedLoop("two", "0001")];
  assert.deepEqual(resolveGiftCard("GC-DEMO-0001", cards), {
    kind: "ambiguous",
    last4: "0001",
    count: 2,
  });
  assert.deepEqual(resolveGiftCard("GC-DEMO-9999", cards), {
    kind: "unmatched",
    last4: "9999",
  });
  assert.deepEqual(resolveGiftCard("GC-DEMO-0001", [cards[0]!]), {
    kind: "matched",
    card: cards[0],
  });
});

test("instrument construction preserves gift-first ordering and omits client amounts", () => {
  const instruments = buildInstruments({ code: "GC-1", pin: "1234" }, "pm_card_visa");
  assert.deepEqual(instruments.map((instrument) => instrument.type), ["gift_card", "card"]);
  assert.ok(instruments.every((instrument) => !("amount" in instrument)));
});
