/**
 * Prove the card rail is real.
 *
 * Every other test in this project asserts against a fake Stripe client, which can only ever
 * confirm that the code agrees with itself. This script does the thing: it starts the real
 * storefront on a real socket, completes a real split checkout over HTTP, and then asks
 * **Stripe** what happened rather than asking our own code. The PaymentIntent it prints back
 * was created by Stripe, and its `livemode` flag is Stripe's word, not ours.
 *
 * Three parts:
 *
 *   1. Enrolling an open-loop prepaid card, through the same endpoints the browser calls.
 *   2. A gift card plus a card that works — the card is charged the remainder, and the order
 *      is placed.
 *   3. The same cart with a card that declines for insufficient funds — the gift card comes
 *      back to exactly where it started, and Stripe holds no captured charge.
 *
 *   pnpm --filter @pay-agent/store seed
 *   pnpm --filter @pay-agent/store stripe-check
 */

import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type Stripe from "stripe";

import { format, minorUnits } from "@pay-agent/db";

import { CheckoutService } from "../src/api/checkout";
import { FundingService } from "../src/api/funding";
import { initDbs } from "../src/data/db";
import {
  CheckoutCompleteRequestSchema,
  ExtendedCheckoutCreateRequestSchema,
  ExtendedCheckoutUpdateRequestSchema,
} from "../src/models";
import { getFundingStore } from "../src/payments/gift-card";
import { STRIPE_HANDLER_ID, testClient } from "../src/payments/stripe";
import { IdParamSchema, prettyValidation } from "../src/utils/validation";

const PRODUCT = "bouquet_roses";
const GIFT_CARD_SHORTFALL = 1000; // leave $10.00 for the card, so the split is visible
const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Stripe's own published test PaymentMethods.
 *
 * Deliberately not raw card numbers: a PAN has no business passing through this repository
 * even in test mode, and these are the tokens Stripe documents for exactly this purpose.
 */
const PM_SUCCESS = "pm_card_visa";
const PM_INSUFFICIENT_FUNDS = "pm_card_chargeDeclinedInsufficientFunds";
/** The one Stripe reports as `funding: prepaid`, which is what an open-loop gift card is. */
const PM_PREPAID = "pm_card_mastercard_prepaid";

const stripe = testClient();
if (!stripe) {
  console.error("STRIPE_SECRET_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// Is the key good, and is it really test mode? Asked before anything is charged, and
// answered by Stripe: `livemode` is its flag, not a local inference from the key prefix.
const balance = await stripe.balance.retrieve();
console.log(
  `\nStripe key accepted  livemode=${balance.livemode}  ` +
    `settlement_currencies=${balance.available.map((b) => b.currency.toUpperCase()).join(",")}`,
);
if (balance.livemode) {
  console.error("Refusing to run: this is a live key. stripe-check is test mode only.");
  process.exit(1);
}

initDbs("databases/products.db", "databases/transactions.db");
const funding = getFundingStore();

const app = new Hono<{ Variables: { logger: Pick<Console, "info" | "warn" | "error"> } }>();
const svc = new CheckoutService();

// The request validator logs every payload it accepts. That is useful when running the
// server; here it would bury the four lines this script exists to print, so only genuine
// errors are surfaced.
const quiet = { info: () => {}, warn: () => {}, error: console.error };
app.use(async (c, next) => {
  c.set("logger", quiet);
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

const funding_ = new FundingService();
app.post("/funding/setup-intents", funding_.createSetupIntent);
app.post("/funding/cards", funding_.enrollOpenLoopCard);

// Port 0 asks the OS for a free one, so this cannot collide with a running `pnpm dev`.
const server = serve({ fetch: app.fetch, port: 0 });
const address = server.address();
const base = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;

async function readyCart(): Promise<{ id: string; total: number }> {
  const created = (await (
    await fetch(`${base}/checkout-sessions`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        line_items: [{ item: { id: PRODUCT }, quantity: 1 }],
        payment: {},
        buyer: { email: "john.doe@example.com" },
        fulfillment: { methods: [{ type: "shipping", selected_destination_id: "addr_1" }] },
      }),
    })
  ).json()) as {
    id?: string;
    detail?: string;
    fulfillment: {
      methods: { groups: { id: string; line_item_ids: string[]; options: { id: string }[] }[] }[];
    };
  };

  if (!created.id) {
    throw new Error(
      `Could not create a checkout (${created.detail}). ` +
        `Run: pnpm --filter @pay-agent/store seed`,
    );
  }

  const group = created.fulfillment.methods[0]!.groups[0]!;
  const updated = (await (
    await fetch(`${base}/checkout-sessions/${created.id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        line_items: [{ id: "line_1", item: { id: PRODUCT }, quantity: 1 }],
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

  return { id: created.id, total: updated.totals.find((t) => t.type === "total")!.amount };
}

/**
 * Find the PaymentIntent this checkout produced — from Stripe's side.
 *
 * Listing and matching on metadata rather than using Search, because Search runs on an index
 * that lags by up to a minute and this needs to be true the moment the checkout returns.
 */
async function intentFor(checkoutId: string): Promise<Stripe.PaymentIntent | undefined> {
  const recent = await stripe!.paymentIntents.list({ limit: 20 });
  return recent.data.find((pi) => pi.metadata["checkout_id"] === checkoutId);
}

async function run(label: string, paymentMethodId: string) {
  const { id, total } = await readyCart();
  const code = `GC-CHECK-${Date.now()}`;
  const card = await funding.cards.issueClosedLoop({
    userId: process.env["DEMO_USER_ID"] ?? "demo-user",
    code,
    pin: "1234",
    initialBalance: minorUnits(total - GIFT_CARD_SHORTFALL),
  });
  const opening = await funding.ledger.balanceOf(card.id);

  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 56 - label.length))}`);
  console.log(`  cart ${format(minorUnits(total))}   gift card ••••${card.last4} ${format(opening)}`);

  const res = await fetch(`${base}/checkout-sessions/${id}/complete`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      payment: {
        instruments: [
          { id: "pi_gc", handler_id: "gift_card", type: "gift_card", credential: { type: "gift_card", code, pin: "1234" } },
          { id: "pi_card", handler_id: STRIPE_HANDLER_ID, type: "card", credential: { type: "network_token", token: paymentMethodId } },
        ],
      },
    }),
  });

  const body = (await res.json()) as { detail?: string; code?: string; order?: { id: string } };
  const closing = await funding.ledger.balanceOf(card.id);
  const intent = await intentFor(id);

  console.log(`  HTTP ${res.status}  ${body.order ? `order ${body.order.id}` : `${body.code ?? ""} ${body.detail ?? ""}`.trim()}`);
  if (intent) {
    const charge = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    console.log(
      `  Stripe ${intent.id}  ${format(minorUnits(intent.amount))} ${intent.currency.toUpperCase()}  ` +
        `status=${intent.status}  captured=${format(minorUnits(intent.amount_received))}  ` +
        `livemode=${intent.livemode}${charge ? `  charge=${charge}` : ""}`,
    );
  } else {
    console.log("  Stripe: no PaymentIntent was created for this checkout");
  }
  console.log(`  gift card ${format(opening)} → ${format(closing)}`);

  return { status: res.status, opening, closing, intent };
}

/**
 * Enroll a prepaid card the way the page does.
 *
 * The one step performed differently is the confirmation: in the browser that happens inside
 * a Stripe-hosted iframe with a real card number, and here it is `setupIntents.confirm` with
 * one of Stripe's published test PaymentMethods. That difference is the point — the card
 * number is Stripe's business in both cases, and this script has no way to see one either.
 */
async function enrollPrepaidCard() {
  console.log(`\n── enrolling an open-loop card ${"─".repeat(30)}`);

  const setup = (await (
    await fetch(`${base}/funding/setup-intents`, { method: "POST" })
  ).json()) as { client_secret: string };

  // The id is the part of the client secret before the separator. The browser gets it back
  // from `confirmSetup` instead; only this script has to take it apart.
  const setupIntentId = setup.client_secret.split("_secret_")[0]!;
  await stripe!.setupIntents.confirm(setupIntentId, { payment_method: PM_PREPAID });

  const res = await fetch(`${base}/funding/cards`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ setup_intent_id: setupIntentId, enrolled_balance: 50 }),
  });

  const card = (await res.json()) as {
    brand?: string;
    last4?: string;
    payment_method_id?: string;
    enrolled_balance_display?: string;
    balance_verified?: boolean;
    funding?: string;
    detail?: string;
  };

  if (!res.ok) {
    console.log(`  HTTP ${res.status}  ${card.detail}`);
    return card;
  }

  console.log(
    `  HTTP ${res.status}  ${card.brand} ••••${card.last4}  ${card.payment_method_id}\n` +
      `  funding=${card.funding}  balance ${card.enrolled_balance_display} ` +
      `(verified=${card.balance_verified})`,
  );
  return card;
}

const enrolled = await enrollPrepaidCard();

const ok = await run("card that works", PM_SUCCESS);
const declined = await run("card that declines: insufficient funds", PM_INSUFFICIENT_FUNDS);

console.log("\n── what this proves " + "─".repeat(41));
console.log(
  `  we hold a payment method, never a card number:  ` +
    `${enrolled.payment_method_id?.startsWith("pm_") ? "yes, " + enrolled.payment_method_id : "NO"}`,
);
console.log(
  `  the enrolled balance is stored as a claim:      ` +
    `${enrolled.balance_verified === false ? "yes, unverified" : "NO"}`,
);
console.log(
  `  the card was asked for the remainder only:      ` +
    `${ok.intent ? format(minorUnits(ok.intent.amount)) : "—"}`,
);
console.log(
  `  the successful charge is a real Stripe object:  ` +
    `${ok.intent?.status === "succeeded" && ok.intent.livemode === false ? "yes, test mode" : "NO"}`,
);
console.log(
  `  the declined run left the gift card untouched:  ` +
    `${declined.opening === declined.closing ? `yes, ${format(declined.closing)}` : "NO"}`,
);
console.log(
  `  the declined run captured nothing:              ` +
    `${(declined.intent?.amount_received ?? 0) === 0 ? "yes" : "NO"}\n`,
);

await funding.close();
server.close();
