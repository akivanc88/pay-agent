/** Verifies gift-card draws, open-amount behavior, and exact compensating reversals. */

import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { minorUnits, openSqliteStore, type Store } from "@pay-agent/db";

import { CheckoutService } from "../src/api/checkout";
import { getProductsDb, getTransactionsDb, initDbs } from "../src/data/db";
import {
  CheckoutCompleteRequestSchema,
  ExtendedCheckoutCreateRequestSchema,
  ExtendedCheckoutUpdateRequestSchema,
} from "../src/models";
import { setFundingStore } from "../src/payments/gift-card";
import { IdParamSchema, prettyValidation } from "../src/utils/validation";

/**
 * Gift cards as a UCP payment instrument, end to end through the checkout API.
 *
 * The upstream reference implementation reads only `payment.instruments[0]`, so a cart
 * paid with a gift card *and* a card is expressible in the protocol but unhandled. These
 * tests cover the behaviour that gap hides — and the one that matters most: when a
 * checkout fails after gift cards were drawn, every cent goes back.
 */

/**
 * Cart totals are read back from the merchant rather than hardcoded.
 *
 * An earlier version of this file assumed the rose plus shipping came to $40.00. It came
 * to $35.00, and the tests failed for a reason that had nothing to do with gift cards.
 * Asserting against the merchant's own arithmetic keeps these tests about the funding
 * behaviour they exist to cover.
 */

function buildApp() {
  const svc = new CheckoutService();
  const app = new Hono<{ Variables: { logger: typeof console } }>();
  app.use(async (c, next) => {
    c.set("logger", console);
    await next();
  });
  app.post(
    "/checkout-sessions",
    zValidator("json", ExtendedCheckoutCreateRequestSchema, prettyValidation),
    svc.createCheckout,
  );
  app.put(
    "/checkout-sessions/:id",
    zValidator("param", IdParamSchema, prettyValidation),
    zValidator("json", ExtendedCheckoutUpdateRequestSchema, prettyValidation),
    svc.updateCheckout,
  );
  app.post(
    "/checkout-sessions/:id/complete",
    zValidator("param", IdParamSchema, prettyValidation),
    zValidator("json", CheckoutCompleteRequestSchema, prettyValidation),
    svc.completeCheckout,
  );
  return app;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

before(() => {
  initDbs(":memory:", ":memory:");
  getProductsDb()
    .prepare("INSERT INTO products (id, title, price, image_url) VALUES (?, ?, ?, ?)")
    .run("bouquet_roses", "Red Rose", 3500, "");
  getTransactionsDb()
    .prepare("INSERT INTO inventory (product_id, quantity) VALUES (?, ?)")
    .run("bouquet_roses", 1000);
});

let funding: Store;

beforeEach(() => {
  // A fresh in-memory ledger per test, so balances never leak between cases.
  funding = openSqliteStore(":memory:");
  setFundingStore(funding);
});

async function issue(code: string, balance: number, pin = "1234") {
  return funding.cards.issueClosedLoop({
    userId: "test-user",
    code,
    pin,
    initialBalance: minorUnits(balance),
  });
}

/** Drive a cart to the point where it can be completed, returning its id and real total. */
async function readyCart(
  app: ReturnType<typeof buildApp>,
): Promise<{ id: string; total: number }> {
  const created = (await (
    await app.request("/checkout-sessions", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        currency: "CAD",
        line_items: [{ item: { id: "bouquet_roses" }, quantity: 1 }],
        payment: {},
        buyer: { email: "john.doe@example.com" },
        fulfillment: {
          methods: [{ type: "shipping", selected_destination_id: "addr_1" }],
        },
      }),
    })
  ).json()) as {
    id: string;
    fulfillment: {
      methods: { groups: { id: string; line_item_ids: string[]; options: { id: string }[] }[] }[];
    };
  };

  const group = created.fulfillment.methods[0]!.groups[0]!;
  const updated = (await (
    await app.request(`/checkout-sessions/${created.id}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      currency: "CAD",
      line_items: [{ id: "line_1", item: { id: "bouquet_roses" }, quantity: 1 }],
      buyer: { email: "john.doe@example.com" },
      fulfillment: {
        methods: [
          {
            type: "shipping",
            selected_destination_id: "addr_1",
            groups: [
              {
                id: group.id,
                line_item_ids: group.line_item_ids,
                selected_option_id: group.options[0]!.id,
              },
            ],
          },
        ],
      },
    }),
    })
  ).json()) as { totals: { type: string; amount: number }[] };

  const total = updated.totals.find((t) => t.type === "total")?.amount;
  assert.ok(typeof total === "number", "merchant must quote a total before completion");
  return { id: created.id, total };
}

function giftCardInstrument(code: string, pin = "1234", id = "pi_gc") {
  return {
    id,
    handler_id: "gift_card",
    type: "gift_card",
    credential: { type: "gift_card", code, pin },
  };
}

function cardInstrument(token = "success_token") {
  return {
    id: "pi_card",
    handler_id: "mock_payment_handler",
    type: "card",
    brand: "visa",
    last_digits: "4242",
    credential: { type: "network_token", token },
  };
}

async function complete(app: ReturnType<typeof buildApp>, id: string, instruments: unknown[]) {
  return app.request(`/checkout-sessions/${id}/complete`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ payment: { instruments } }),
  });
}

test("a single gift card covering the whole cart completes the checkout", async () => {
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const card = await issue("GC-FULL-0001", total);

  const res = await complete(app, id, [giftCardInstrument("GC-FULL-0001")]);

  assert.equal(res.status, 200);
  assert.equal(await funding.ledger.balanceOf(card.id), 0, "the card should be drawn dry");
});

test("gift card plus card settles the whole instruments array, not just the first", async () => {
  // This is the case upstream cannot express: instruments[0] alone would ignore one of
  // these entirely. $25 on the card leaves $15 for the rail.
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const gc = await issue("GC-SPLIT-0001", total - 1000);

  const res = await complete(app, id, [
    giftCardInstrument("GC-SPLIT-0001"),
    cardInstrument(),
  ]);

  assert.equal(res.status, 200);
  assert.equal(await funding.ledger.balanceOf(gc.id), 0, "the gift card should be drawn dry");
});

test("several gift cards are drawn in order until the total is met", async () => {
  const app = buildApp();
  const { id, total } = await readyCart(app);
  // The first card covers all but $10; the second must supply exactly that remainder and
  // keep the rest, which is what "drawn in order, open-amount" means.
  const firstBalance = total - 1000;
  const first = await issue("GC-MULTI-0001", firstBalance);
  const second = await issue("GC-MULTI-0002", 2500, "5678");

  const res = await complete(app, id, [
    giftCardInstrument("GC-MULTI-0001"),
    giftCardInstrument("GC-MULTI-0002", "5678", "pi_gc2"),
  ]);

  assert.equal(res.status, 200);
  assert.equal(await funding.ledger.balanceOf(first.id), 0, "first card drawn dry");
  assert.equal(
    await funding.ledger.balanceOf(second.id),
    1500,
    "second card supplies only the $10 remainder",
  );
});

test("an empty gift card contributes $0 without failing the checkout", async () => {
  // UCP is explicit that a zero balance is a valid contribution. Treating it as an error
  // is a common way to get gift-card handling wrong.
  const app = buildApp();
  const { id } = await readyCart(app);
  const empty = await issue("GC-EMPTY-0001", 0);

  const res = await complete(app, id, [
    giftCardInstrument("GC-EMPTY-0001"),
    cardInstrument(),
  ]);

  assert.equal(res.status, 200);
  assert.equal(await funding.ledger.balanceOf(empty.id), 0);
});

test("gift cards short of the total, with no other instrument, are refused", async () => {
  const app = buildApp();
  const { id } = await readyCart(app);
  const gc = await issue("GC-SHORT-0001", 1000);

  const res = await complete(app, id, [giftCardInstrument("GC-SHORT-0001")]);

  assert.equal(res.status, 402);
  // And crucially the partial draw is handed back, not stranded.
  assert.equal(
    await funding.ledger.balanceOf(gc.id),
    1000,
    "a refused checkout must not keep the money",
  );
});

test("a wrong PIN is refused, and is indistinguishable from an unknown card", async () => {
  const app = buildApp();
  const { id, total } = await readyCart(app);
  await issue("GC-PIN-0001", total);

  const wrongPin = await complete(app, id, [giftCardInstrument("GC-PIN-0001", "9999")]);
  const unknown = await complete(app, id, [giftCardInstrument("GC-NO-SUCH-CARD", "1234")]);

  assert.equal(wrongPin.status, 402);
  assert.equal(unknown.status, 402);
  assert.deepEqual(
    await wrongPin.json(),
    await unknown.json(),
    "the two must be indistinguishable, or codes can be enumerated",
  );
});

test("a declined card gives every drawn gift-card balance back", async () => {
  // The invariant the whole decline story rests on: the rail fails *after* the gift cards
  // were already drawn, and the buyer must not be left out of pocket.
  const app = buildApp();
  const { id } = await readyCart(app);
  const gc = await issue("GC-DECLINE-0001", 2500);

  const res = await complete(app, id, [
    giftCardInstrument("GC-DECLINE-0001"),
    cardInstrument("fail_token"),
  ]);

  assert.equal(res.status, 402);
  assert.equal(
    await funding.ledger.balanceOf(gc.id),
    2500,
    "balance must be restored exactly after a decline",
  );
});

test("the reversal is recorded rather than erasing the draw", async () => {
  const app = buildApp();
  const { id } = await readyCart(app);
  const gc = await issue("GC-AUDIT-0001", 2500);

  await complete(app, id, [giftCardInstrument("GC-AUDIT-0001"), cardInstrument("fail_token")]);

  const kinds = (await funding.ledger.entriesFor(gc.id)).map((e) => e.kind);
  assert.deepEqual(kinds, ["issue", "redeem", "reverse"], "the audit trail is the product");
});
