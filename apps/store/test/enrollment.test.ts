/** Verifies server-side Stripe SetupIntent enrollment checks and stored card metadata. */

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { Hono } from "hono";
import type Stripe from "stripe";
import { openSqliteStore, type OpenLoopCard, type Store } from "@pay-agent/db";

import { FundingService } from "../src/api/funding";
import { setFundingStore } from "../src/payments/gift-card";
import { setStripeClient } from "../src/payments/stripe";

/**
 * Enrolling an open-loop card.
 *
 * The card number is collected by Stripe in the browser, so there is nothing here to test
 * about it — the interesting behaviour is entirely on the trust boundary the browser sits
 * on. The page hands back a SetupIntent id, and everything the server records has to come
 * from asking Stripe rather than from believing that message.
 */

const MARKER = "pay_agent_open_loop_enrollment";
const JSON_HEADERS = { "Content-Type": "application/json" };

function buildApp() {
  const svc = new FundingService();
  const app = new Hono();
  app.get("/enroll", svc.getEnrollPage);
  app.post("/funding/setup-intents", svc.createSetupIntent);
  app.post("/funding/cards", svc.enrollOpenLoopCard);
  app.get("/funding/cards", svc.listCards);
  return app;
}

/** A Stripe stand-in holding one SetupIntent and one PaymentMethod. */
function fakeStripe(intent: Partial<Stripe.SetupIntent>) {
  const created: Stripe.SetupIntentCreateParams[] = [];

  const stripe = {
    setupIntents: {
      create: async (params: Stripe.SetupIntentCreateParams) => {
        created.push(params);
        return { id: "seti_created", client_secret: "seti_created_secret_abc" };
      },
      retrieve: async () => intent,
    },
    paymentMethods: {
      retrieve: async (id: string) => ({
        id,
        card: { brand: "mastercard", last4: "5100", exp_month: 12, exp_year: 2034, funding: "prepaid" },
      }),
    },
  };

  setStripeClient(stripe as unknown as Stripe);
  return { created };
}

/** The shape the page actually posts: a SetupIntent id and a number the user typed. */
function enrollBody(extra: Record<string, unknown> = {}) {
  return JSON.stringify({ setup_intent_id: "seti_created", enrolled_balance: 25, ...extra });
}

let funding: Store;

beforeEach(() => {
  funding = openSqliteStore(":memory:");
  setFundingStore(funding);
  setStripeClient(null);
});

after(() => setStripeClient(null));

test("a setup intent is created for off-session use and marked as ours", async () => {
  const { created } = fakeStripe({});
  const res = await buildApp().request("/funding/setup-intents", { method: "POST" });

  assert.equal(res.status, 200);
  assert.equal((await res.json()).client_secret, "seti_created_secret_abc");
  // Off-session at enrollment time is what makes the later charge a genuine issuer
  // decision rather than a skipped authentication step.
  assert.equal(created[0]!.usage, "off_session");
  assert.equal(created[0]!.metadata![MARKER], "1");
});

test("the payment method comes from Stripe, never from the request body", async () => {
  // The invariant the whole endpoint exists for. A client that could name a PaymentMethod
  // could enroll a card belonging to somebody else on the same account.
  fakeStripe({
    status: "succeeded",
    metadata: { [MARKER]: "1", user_id: "demo-user" },
    payment_method: "pm_from_stripe",
  } as Partial<Stripe.SetupIntent>);

  const res = await buildApp().request("/funding/cards", {
    method: "POST",
    headers: JSON_HEADERS,
    body: enrollBody({ payment_method: "pm_someone_elses", brand: "amex", last4: "0000" }),
  });

  assert.equal(res.status, 201);
  const [card] = (await funding.cards.listForUser("demo-user")) as OpenLoopCard[];
  assert.equal(card!.paymentMethodId, "pm_from_stripe");
  assert.equal(card!.brand, "mastercard", "brand comes from Stripe too, not from the client");
  assert.equal(card!.last4, "5100");
});

test("a setup intent we did not create for enrollment is refused", async () => {
  fakeStripe({ status: "succeeded", metadata: {}, payment_method: "pm_x" } as Partial<Stripe.SetupIntent>);

  const res = await buildApp().request("/funding/cards", {
    method: "POST",
    headers: JSON_HEADERS,
    body: enrollBody(),
  });

  assert.equal(res.status, 403);
  assert.deepEqual(await funding.cards.listForUser("demo-user"), []);
});

test("a setup that has not succeeded enrolls nothing", async () => {
  fakeStripe({
    status: "requires_payment_method",
    metadata: { [MARKER]: "1" },
  } as Partial<Stripe.SetupIntent>);

  const res = await buildApp().request("/funding/cards", {
    method: "POST",
    headers: JSON_HEADERS,
    body: enrollBody(),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await funding.cards.listForUser("demo-user"), []);
});

test("the balance is recorded in minor units and marked unverified", async () => {
  fakeStripe({
    status: "succeeded",
    metadata: { [MARKER]: "1", user_id: "demo-user" },
    payment_method: "pm_from_stripe",
  } as Partial<Stripe.SetupIntent>);

  const res = await buildApp().request("/funding/cards", {
    method: "POST",
    headers: JSON_HEADERS,
    body: enrollBody({ enrolled_balance: 25.5 }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.enrolled_balance, 2550, "dollars in, integer minor units stored");
  assert.equal(body.balance_verified, false);
  assert.equal(body.funding, "prepaid");
});

test("a negative balance is refused before Stripe is called", async () => {
  fakeStripe({});
  const res = await buildApp().request("/funding/cards", {
    method: "POST",
    headers: JSON_HEADERS,
    body: enrollBody({ enrolled_balance: -1 }),
  });
  assert.equal(res.status, 400);
});

test("the funding pool never shows an open-loop balance as verified", async () => {
  // No API can query the balance of an open-loop prepaid card. Displaying the figure the
  // user typed without saying so would be the single most misleading thing this UI could do.
  await funding.cards.enrollOpenLoop({
    userId: "demo-user",
    paymentMethodId: "pm_x",
    brand: "visa",
    last4: "4242",
    expMonth: 1,
    expYear: 2034,
    enrolledBalance: 5000 as never,
  });
  await funding.cards.issueClosedLoop({
    userId: "demo-user",
    code: "GC-LIST-0001",
    pin: "1234",
    initialBalance: 2500 as never,
  });

  const { cards } = await (await buildApp().request("/funding/cards")).json();
  const open = cards.find((c: { family: string }) => c.family === "open_loop");
  const closed = cards.find((c: { family: string }) => c.family === "closed_loop");

  assert.equal(open.balance_verified, false);
  assert.equal(open.balance_display, "$50.00");
  // The contrast is the point: a closed-loop balance is derived from our own ledger, so it
  // is a fact rather than a claim.
  assert.equal(closed.balance_verified, true);
  assert.equal(closed.balance_display, "$25.00");
});

test("the page carries the publishable key and no secret", async () => {
  const previous = process.env["STRIPE_PUBLISHABLE_KEY"];
  process.env["STRIPE_PUBLISHABLE_KEY"] = "pk_test_page";

  const html = await (await buildApp().request("/enroll")).text();

  assert.match(html, /PUBLISHABLE_KEY = "pk_test_page"/);
  assert.doesNotMatch(html, /__STRIPE_PUBLISHABLE_KEY__/, "the placeholder must be substituted");
  assert.doesNotMatch(html, /sk_(test|live)_/, "no secret key may reach the browser");
  // Stripe.js has to be loaded from Stripe's domain — self-hosting it breaks the PCI
  // SAQ-A eligibility that is the entire reason for collecting the card this way.
  assert.match(html, /https:\/\/js\.stripe\.com\/v3\//);

  if (previous === undefined) delete process.env["STRIPE_PUBLISHABLE_KEY"];
  else process.env["STRIPE_PUBLISHABLE_KEY"] = previous;
});
