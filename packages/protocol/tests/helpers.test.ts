/** Focused characterization of shared wire helpers and gift-first arithmetic. */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildPaymentInstruments,
  checkoutTotalOf,
  fulfillmentIsComplete,
  lineItemsPayload,
  normalizeGiftCode,
  splitKnownBalance,
  type CheckoutSession,
} from "../src/index.js";

function session(overrides: Partial<CheckoutSession> = {}): CheckoutSession {
  return {
    id: "checkout_1",
    status: "ready",
    currency: "CAD",
    line_items: [{ id: "line_1", item: { id: "roses" }, quantity: 2 }],
    totals: [{ type: "subtotal", amount: 7000 }],
    ...overrides,
  };
}

test("total selection prefers merchant total and preserves a missing quote", () => {
  assert.equal(
    checkoutTotalOf(session({ totals: [{ type: "subtotal", amount: 7000 }, { type: "total", amount: 7900 }] })),
    7900,
  );
  assert.equal(checkoutTotalOf(session({ totals: [] })), undefined);
});

test("fulfillment completion requires a destination and every group option", () => {
  const ready = session({
    fulfillment: {
      methods: [{
        type: "shipping",
        selected_destination_id: "dest_1",
        groups: [{ id: "group_1", line_item_ids: ["line_1"], selected_option_id: "standard" }],
      }],
    },
  });
  assert.equal(fulfillmentIsComplete(ready), true);
  assert.equal(
    fulfillmentIsComplete(session({ fulfillment: { methods: [{ type: "shipping", groups: [] }] } })),
    false,
  );
});

test("line item payload strips merchant enrichment but retains stable line ids", () => {
  assert.deepEqual(lineItemsPayload(session()), [
    { id: "line_1", item: { id: "roses" }, quantity: 2 },
  ]);
});

test("gift code normalization removes separators and normalizes case", () => {
  assert.equal(normalizeGiftCode(" gc-test  - 0001 "), "GCTEST0001");
});

test("instrument builders preserve gift-first order, identifiers, and open amounts", () => {
  assert.deepEqual(buildPaymentInstruments({ code: "GC-1", pin: "1234" }, "pm_card_visa"), [
    {
      id: "gift_card_1",
      type: "gift_card",
      handler_id: "gift_card",
      credential: { type: "gift_card", code: "GC-1", pin: "1234" },
    },
    {
      id: "card_1",
      type: "card",
      handler_id: "stripe_payments",
      credential: { type: "card", token: "pm_card_visa" },
    },
  ]);
});

test("known balance splitting is gift-first and reports uncovered remainder", () => {
  assert.deepEqual(
    splitKnownBalance({ amountMinor: 7500, giftBalanceMinor: 2000, useGift: true, useCard: true }),
    { giftDrawMinor: 2000, cardMinor: 5500, uncoveredMinor: 0 },
  );
  assert.deepEqual(
    splitKnownBalance({ amountMinor: 7500, giftBalanceMinor: 2000, useGift: true, useCard: false }),
    { giftDrawMinor: 2000, cardMinor: 0, uncoveredMinor: 5500 },
  );
});
