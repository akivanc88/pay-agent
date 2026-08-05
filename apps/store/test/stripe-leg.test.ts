import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import Stripe from "stripe";
import { minorUnits, openSqliteStore, type Store } from "@pay-agent/db";

import { CheckoutService } from "../src/api/checkout";
import { getProductsDb, getTransactionsDb, initDbs } from "../src/data/db";
import {
  CheckoutCompleteRequestSchema,
  ExtendedCheckoutCreateRequestSchema,
  ExtendedCheckoutUpdateRequestSchema,
} from "../src/models";
import { setFundingStore } from "../src/payments/gift-card";
import {
  assertSafeStripeConfig,
  isDeployedEnvironment,
  liveClient,
  setStripeClient,
  StripeConfigError,
} from "../src/payments/stripe";
import { IdParamSchema, prettyValidation } from "../src/utils/validation";

/**
 * The card rail: what it is asked for, and what happens to it when the checkout fails.
 *
 * These tests never reach the network. A fake client records what the checkout asked Stripe
 * to do, which is the part worth asserting — the amount authorized, whether it was captured,
 * and whether a failed checkout released the hold. That a real charge actually works is a
 * different question, and is answered by an actual test-mode charge in `stripe-check`
 * rather than by a mock agreeing with itself.
 */

const CART_PRODUCT = "bouquet_roses";

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

interface CreateParams {
  amount: number;
  currency: string;
  payment_method: string;
  capture_method: string;
  metadata: Record<string, string>;
}

/**
 * A Stripe stand-in that records calls.
 *
 * `failCreate` and `failCapture` take the error to throw, so a test can decline with the
 * error type Stripe itself constructs — `StripeCardError` is selected on a 402 response,
 * so building one directly is the same object the real path would catch.
 */
function fakeStripe(opts: { failCreate?: Error; failCapture?: Error } = {}) {
  const created: CreateParams[] = [];
  const captured: string[] = [];
  const cancelled: string[] = [];

  const stripe = {
    paymentIntents: {
      create: async (params: CreateParams) => {
        created.push(params);
        if (opts.failCreate) throw opts.failCreate;
        return { id: "pi_fake_123", status: "requires_capture" };
      },
      capture: async (id: string) => {
        captured.push(id);
        if (opts.failCapture) throw opts.failCapture;
        return { id, status: "succeeded" };
      },
      cancel: async (id: string) => {
        cancelled.push(id);
        return { id, status: "canceled" };
      },
    },
  };

  setStripeClient(stripe as unknown as Stripe);
  return { created, captured, cancelled };
}

function declinedCard() {
  return new Stripe.errors.StripeCardError({
    type: "card_error",
    message: "Your card has insufficient funds.",
    code: "card_declined",
    decline_code: "insufficient_funds",
  });
}

before(() => {
  initDbs(":memory:", ":memory:");
  getProductsDb()
    .prepare("INSERT INTO products (id, title, price, image_url) VALUES (?, ?, ?, ?)")
    .run(CART_PRODUCT, "Red Rose", 3500, "");
});

after(() => setStripeClient(null));

let funding: Store;

beforeEach(() => {
  funding = openSqliteStore(":memory:");
  setFundingStore(funding);
  setStripeClient(null);
  // Restocked per test so an out-of-stock case cannot strand the ones after it.
  getTransactionsDb()
    .prepare(
      "INSERT INTO inventory (product_id, quantity) VALUES (?, 1000) " +
        "ON CONFLICT(product_id) DO UPDATE SET quantity = 1000",
    )
    .run(CART_PRODUCT);
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
async function readyCart(app: ReturnType<typeof buildApp>): Promise<{ id: string; total: number }> {
  const created = (await (
    await app.request("/checkout-sessions", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        currency: "CAD",
        line_items: [{ item: { id: CART_PRODUCT }, quantity: 1 }],
        payment: {},
        buyer: { email: "john.doe@example.com" },
        fulfillment: { methods: [{ type: "shipping", selected_destination_id: "addr_1" }] },
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
        line_items: [{ id: "line_1", item: { id: CART_PRODUCT }, quantity: 1 }],
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

  const total = updated.totals.find((t) => t.type === "total")!.amount;
  return { id: created.id, total };
}

function giftCardInstrument(code: string, pin = "1234") {
  return {
    id: "pi_gc",
    handler_id: "gift_card",
    type: "gift_card",
    credential: { type: "gift_card", code, pin },
  };
}

function stripeInstrument(token = "pm_card_visa") {
  return {
    id: "pi_stripe",
    handler_id: "stripe_payments",
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

// ---------------------------------------------------------------------------
// What the card is asked for
// ---------------------------------------------------------------------------

test("the card is authorized for the remainder, not the cart total", async () => {
  // The claim this project rests on. Charging the total here would take the money twice.
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const gc = await issue("GC-REM-0001", total - 1000);
  const calls = fakeStripe();

  const res = await complete(app, id, [giftCardInstrument("GC-REM-0001"), stripeInstrument()]);

  assert.equal(res.status, 200);
  assert.equal(calls.created.length, 1);
  assert.equal(calls.created[0]!.amount, 1000, "the card covers only what the gift card could not");
  assert.equal(calls.created[0]!.currency, "cad", "the rail and the ledger must agree on currency");
  assert.equal(await funding.ledger.balanceOf(gc.id), 0);
});

test("a cart with no gift card authorizes the whole total", async () => {
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const calls = fakeStripe();

  const res = await complete(app, id, [stripeInstrument()]);

  assert.equal(res.status, 200);
  assert.equal(calls.created[0]!.amount, total);
});

test("gift cards covering everything leave the card untouched", async () => {
  // A zero-amount authorization is not a thing Stripe accepts, so asking for one would fail
  // the checkout at the exact moment it had actually succeeded.
  const app = buildApp();
  const { id, total } = await readyCart(app);
  await issue("GC-FULL-0002", total);
  const calls = fakeStripe();

  const res = await complete(app, id, [giftCardInstrument("GC-FULL-0002"), stripeInstrument()]);

  assert.equal(res.status, 200);
  assert.deepEqual(calls.created, [], "the rail must not be touched when nothing is owed on it");
});

// ---------------------------------------------------------------------------
// Authorize now, capture last
// ---------------------------------------------------------------------------

test("the authorization is held, then captured once the order is certain", async () => {
  const app = buildApp();
  const { id } = await readyCart(app);
  const calls = fakeStripe();

  const res = await complete(app, id, [stripeInstrument()]);

  assert.equal(res.status, 200);
  assert.equal(calls.created[0]!.capture_method, "manual", "the charge is provisional until the order exists");
  assert.deepEqual(calls.captured, ["pi_fake_123"]);
  assert.deepEqual(calls.cancelled, []);
});

test("the run id ties the card authorization to the gift-card draws", async () => {
  // Both legs of a split payment carry the same run id, so the audit trail can be read as
  // one payment attempt rather than two unrelated events.
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const gc = await issue("GC-RUN-0001", total - 1000);
  const calls = fakeStripe();

  await complete(app, id, [giftCardInstrument("GC-RUN-0001"), stripeInstrument()]);

  const runIds = new Set((await funding.ledger.entriesFor(gc.id)).map((e) => e.runId).filter(Boolean));
  assert.equal(runIds.size, 1);
  assert.equal(calls.created[0]!.metadata["run_id"], [...runIds][0]);
});

// ---------------------------------------------------------------------------
// Failure: both legs come back
// ---------------------------------------------------------------------------

test("a declined card gives the gift-card balance back and reports the issuer's reason", async () => {
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const gc = await issue("GC-DECL-0001", total - 1000);
  fakeStripe({ failCreate: declinedCard() });

  const res = await complete(app, id, [giftCardInstrument("GC-DECL-0001"), stripeInstrument()]);

  assert.equal(res.status, 402);
  assert.equal(
    (await res.json()).code,
    "insufficient_funds",
    "the issuer's decline_code is more useful than Stripe's category",
  );
  assert.equal(await funding.ledger.balanceOf(gc.id), total - 1000, "balance restored exactly");
});

test("running out of stock releases the card hold as well as the gift card", async () => {
  // The failure that only exists because authorization and capture are separate. Money is
  // committed on two rails before the merchant knows it can ship, and both have to come back.
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const gc = await issue("GC-STOCK-0001", total - 1000);
  const calls = fakeStripe();

  getTransactionsDb()
    .prepare("UPDATE inventory SET quantity = 0 WHERE product_id = ?")
    .run(CART_PRODUCT);

  const res = await complete(app, id, [giftCardInstrument("GC-STOCK-0001"), stripeInstrument()]);

  assert.equal(res.status, 409);
  assert.deepEqual(calls.cancelled, ["pi_fake_123"], "an uncapturable hold must be released");
  assert.deepEqual(calls.captured, [], "nothing may be captured for an order that cannot ship");
  assert.equal(await funding.ledger.balanceOf(gc.id), total - 1000);
});

test("a failed capture releases the gift cards too", async () => {
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const gc = await issue("GC-CAP-0001", total - 1000);
  fakeStripe({ failCapture: declinedCard() });

  const res = await complete(app, id, [giftCardInstrument("GC-CAP-0001"), stripeInstrument()]);

  assert.equal(res.status, 402);
  assert.equal(await funding.ledger.balanceOf(gc.id), total - 1000);
});

test("an indeterminate capture reverses NOTHING and reports 502", async () => {
  // The capture threw a *transport* error, not a decline: Stripe may have taken the money and
  // only the response was lost. A clean decline reverses the gift (the test above); this must
  // not — refunding the gift beside a possibly-live charge is an underpayment, and cancelling a
  // capture that may have succeeded cannot be relied on. So both legs are LEFT standing and the
  // store answers 502, which the agent resolves by reading the order (there is none), never by
  // retrying a payment.
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const gc = await issue("GC-INDET-0001", total - 1000);
  const calls = fakeStripe({
    failCapture: new Stripe.errors.StripeConnectionError({
      message: "connection reset during capture",
    }),
  });

  const res = await complete(app, id, [giftCardInstrument("GC-INDET-0001"), stripeInstrument()]);

  assert.equal(res.status, 502, "an unknowable capture is indeterminate, not a clean decline");
  assert.equal(
    await funding.ledger.balanceOf(gc.id),
    0,
    "the gift draw is left in place — handing it back beside a possible live charge would underpay",
  );
  assert.deepEqual(calls.cancelled, [], "a possibly-succeeded capture must not be cancelled");
  assert.deepEqual(calls.captured, ["pi_fake_123"], "capture was attempted exactly once, not retried");
});

test("a credential that is not a PaymentMethod id is refused before any network call", async () => {
  const app = buildApp();
  const { id, total } = await readyCart(app);
  const gc = await issue("GC-BADPM-0001", total - 1000);
  const calls = fakeStripe();

  const res = await complete(app, id, [
    giftCardInstrument("GC-BADPM-0001"),
    stripeInstrument("success_token"),
  ]);

  assert.equal(res.status, 400);
  assert.deepEqual(calls.created, []);
  assert.equal(await funding.ledger.balanceOf(gc.id), total - 1000);
});

// ---------------------------------------------------------------------------
// The live-key guards
//
// These are the tests that must exist *before* a live key is ever loaded, because the thing
// they protect against cannot be undone by noticing it afterwards.
// ---------------------------------------------------------------------------

test("a live key in STRIPE_SECRET_KEY is refused", () => {
  assert.throws(
    () => assertSafeStripeConfig({ STRIPE_SECRET_KEY: "sk_live_pretend" }),
    StripeConfigError,
  );
});

test("a live key in a deployed environment refuses to boot", () => {
  for (const deployed of [
    { NODE_ENV: "production" },
    { VERCEL: "1" },
    { FLY_APP_NAME: "pay-agent" },
  ]) {
    assert.throws(
      () => assertSafeStripeConfig({ ...deployed, STRIPE_LIVE_SECRET_KEY: "sk_live_pretend" }),
      StripeConfigError,
      `a live key must be refused when ${Object.keys(deployed)[0]} is set`,
    );
  }
});

test("the live variable must hold an actual live key, or nothing", () => {
  // Pointing it at a test key would silently disarm the guards that key off its presence.
  assert.throws(
    () => assertSafeStripeConfig({ STRIPE_LIVE_SECRET_KEY: "sk_test_pretend" }),
    StripeConfigError,
  );
});

test("an ordinary local test-mode configuration is allowed", () => {
  assert.doesNotThrow(() => assertSafeStripeConfig({ STRIPE_SECRET_KEY: "sk_test_pretend" }));
  assert.doesNotThrow(() =>
    assertSafeStripeConfig({ STRIPE_SECRET_KEY: "sk_test_a", STRIPE_LIVE_SECRET_KEY: "sk_live_b" }),
  );
  assert.equal(isDeployedEnvironment({}), false);
});

// Skipped rather than failed once M4's key is actually on the machine: the assertion is
// about the variable being absent, and it stops being a meaningful test when it is present.
test("the live client cannot be built without the live variable", {
  skip: Boolean(process.env["STRIPE_LIVE_SECRET_KEY"]) && "a live key is configured locally",
}, () => {
  assert.throws(() => liveClient(), StripeConfigError);
});
