import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { type Context } from "hono";
import { z } from "zod";

import { DEFAULT_CURRENCY, format, minorUnits } from "@pay-agent/db";

import {
  getFundingStore,
  settleGiftCards,
  reverseSettlement,
  GiftCardError,
} from "../payments/gift-card";
import { testClient } from "../payments/stripe";

/**
 * Enrolling an open-loop prepaid card.
 *
 * The whole design of this endpoint follows from one constraint: **the card number must
 * never reach this server.** Stripe Elements collects it in the browser and posts it
 * directly to Stripe; what comes back to us is a PaymentMethod id. Storing a PAN — even
 * encrypted — moves the project from PCI SAQ-A to SAQ-D, which means key management,
 * rotation, access logging, quarterly ASV scans and an annual penetration test. Enormous
 * cost, zero demo value.
 *
 * So the flow is deliberately indirect:
 *
 *   1. The browser asks us for a SetupIntent. We create one and hand back only its client
 *      secret, which is useless for anything except confirming this one enrollment.
 *   2. The browser confirms it against Stripe. The card number goes browser → Stripe. It
 *      does not pass through here, and there is no code path by which it could.
 *   3. The browser tells us the SetupIntent succeeded. We do **not** believe it: we fetch
 *      the SetupIntent from Stripe ourselves and read the PaymentMethod id off Stripe's
 *      response. A client-supplied `pm_…` is never trusted, because a client that could
 *      name any PaymentMethod on the account could enroll someone else's card.
 *
 * The balance is a different matter, and worth being blunt about: **no API can query the
 * balance of an open-loop prepaid card.** The figure collected here is what the user typed.
 * It is a planning hint and nothing more, which is why it is stored as `enrolledBalance`
 * beside `balanceVerified: false` rather than as a balance.
 */

/** The one user until real authentication lands with the Supabase migration. */
function demoUserId(): string {
  return process.env["DEMO_USER_ID"] ?? "demo-user";
}

/**
 * Marks a SetupIntent as ours.
 *
 * Stateless on purpose — a server restart mid-enrollment should not strand the card. The
 * marker travels on the SetupIntent itself, so the check survives a restart and does not
 * need a session store this project does not yet have.
 */
const ENROLLMENT_MARKER = "pay_agent_open_loop_enrollment";

const EnrollRequestSchema = z.object({
  setup_intent_id: z.string().startsWith("seti_"),
  /** Dollars, as typed. Converted to minor units here; the ledger only sees integers. */
  enrolled_balance: z.number().nonnegative().finite(),
});

/** A standalone gift-card draw for an external-rail split. Amount is integer minor units. */
const RedeemRequestSchema = z.object({
  code: z.string().min(1),
  pin: z.string().min(1),
  amount_minor: z.number().int().positive(),
  /**
   * Optional caller-supplied run id. It *groups* this draw under one reversible id so `reverse`
   * can hand the whole run back at once — it is NOT an idempotency key. Calling redeem twice with
   * the same run_id draws twice (each up to the live balance); it does not coalesce. A caller must
   * redeem exactly once per run and, on an ambiguous response, reverse-then-reconcile rather than
   * blindly re-redeem. (The agent's payment-link adapter does exactly this: one draw per pay().)
   */
  run_id: z.string().min(1).optional(),
});

const ReverseRequestSchema = z.object({
  run_id: z.string().min(1),
});

export class FundingService {
  /**
   * The enrollment page.
   *
   * Read per request rather than cached so editing the markup does not need a restart. It
   * is one small file on a local demo; the cost is not worth the staleness.
   */
  getEnrollPage = (c: Context) => {
    const html = readFileSync("public/enroll.html", "utf-8");
    return c.html(
      // The publishable key is designed to be public — it is what Stripe.js needs in the
      // browser — but it still belongs in configuration rather than in the markup.
      html.replace("__STRIPE_PUBLISHABLE_KEY__", process.env["STRIPE_PUBLISHABLE_KEY"] ?? ""),
    );
  };

  /** Step 1: hand the browser something it can confirm a card against, and nothing more. */
  createSetupIntent = async (c: Context) => {
    const stripe = testClient();
    if (!stripe) {
      return c.json({ detail: "STRIPE_SECRET_KEY is not configured" }, 503);
    }

    const intent = await stripe.setupIntents.create({
      // The card is being stored so an agent can use it later, with the buyer not present.
      // `off_session` is Stripe's name for exactly that, and setting it at enrollment time
      // is what makes the later charge a genuine issuer decision rather than a skipped
      // authentication step.
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { [ENROLLMENT_MARKER]: "1", user_id: demoUserId() },
    });

    return c.json({ client_secret: intent.client_secret });
  };

  /** Step 3: record the enrollment, believing Stripe rather than the browser. */
  enrollOpenLoopCard = async (c: Context) => {
    const stripe = testClient();
    if (!stripe) {
      return c.json({ detail: "STRIPE_SECRET_KEY is not configured" }, 503);
    }

    const parsed = EnrollRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ detail: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
    }

    const intent = await stripe.setupIntents.retrieve(parsed.data.setup_intent_id);

    if (intent.metadata?.[ENROLLMENT_MARKER] !== "1") {
      // Some other SetupIntent on this account. Refusing it is the difference between
      // "enroll the card you just entered" and "enroll any card you can name".
      return c.json({ detail: "That setup intent was not created for card enrollment" }, 403);
    }
    if (intent.status !== "succeeded") {
      return c.json({ detail: `Card setup did not complete (status: ${intent.status})` }, 400);
    }

    const paymentMethodId =
      typeof intent.payment_method === "string"
        ? intent.payment_method
        : intent.payment_method?.id;
    if (!paymentMethodId) {
      return c.json({ detail: "Setup intent carries no payment method" }, 400);
    }

    const method = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!method.card) {
      return c.json({ detail: "Only card payment methods can be enrolled" }, 400);
    }

    const card = await getFundingStore().cards.enrollOpenLoop({
      userId: intent.metadata["user_id"] ?? demoUserId(),
      paymentMethodId,
      brand: method.card.brand,
      last4: method.card.last4,
      expMonth: method.card.exp_month,
      expYear: method.card.exp_year,
      enrolledBalance: minorUnits(Math.round(parsed.data.enrolled_balance * 100)),
      currency: DEFAULT_CURRENCY,
    });

    return c.json(
      {
        id: card.id,
        brand: card.brand,
        last4: card.last4,
        payment_method_id: card.paymentMethodId,
        enrolled_balance: card.enrolledBalance,
        enrolled_balance_display: format(card.enrolledBalance),
        balance_verified: card.balanceVerified,
        // `funding` is Stripe's own classification. A card enrolled here that comes back
        // `credit` is an ordinary credit card, not a prepaid gift card — worth surfacing,
        // because the M4 decline story only means anything on a prepaid card.
        funding: method.card.funding,
      },
      201,
    );
  };

  /** What is enrolled, for the page to render after a reload. */
  listCards = async (c: Context) => {
    const cards = await getFundingStore().cards.listForUser(demoUserId());
    const ledger = getFundingStore().ledger;

    return c.json({
      cards: await Promise.all(
        cards.map(async (card) =>
          card.family === "open_loop"
            ? {
                family: card.family,
                id: card.id,
                brand: card.brand,
                last4: card.last4,
                exp: `${String(card.expMonth).padStart(2, "0")}/${card.expYear}`,
                balance_display: format(card.enrolledBalance),
                balance_verified: false,
                balance_stale: card.balanceStale,
              }
            : {
                family: card.family,
                id: card.id,
                last4: card.last4,
                balance_display: format(await ledger.balanceOf(card.id)),
                balance_verified: true,
                balance_stale: false,
              },
        ),
      ),
    });
  };

  /**
   * Draw a closed-loop gift card on this store's ledger, standalone.
   *
   * The store's own checkout redeems gift cards inside `complete`, keyed to that checkout. But
   * an external destination — a hosted payment link, a biller — cannot present our gift card to
   * itself, so per the plan the split happens on *our* side: the agent draws the card here, pays
   * the remainder on the destination's own rail, and reverses this draw if that rail declines.
   *
   * This is the same open-amount draw the checkout uses (`settleGiftCards` with one instrument),
   * so a card is drawn up to what it holds and no further — a zero balance is a valid $0 draw,
   * not an error. The returned `run_id` is what `reverse` hands back if the remote leg fails.
   */
  redeem = async (c: Context) => {
    const parsed = RedeemRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ detail: "redeem requires code, pin and a positive amount_minor" }, 400);
    }
    const { code, pin, amount_minor, run_id } = parsed.data;
    const runId = run_id ?? `agent_${randomUUID()}`;

    try {
      const result = await settleGiftCards(
        [{ type: "gift_card", handler_id: "gift_card", credential: { type: "gift_card", code, pin } }],
        minorUnits(amount_minor),
        runId,
      );
      return c.json({
        run_id: runId,
        drawn_minor: result.covered,
        drawn_display: format(result.covered),
        remaining_minor: result.remaining,
        currency: DEFAULT_CURRENCY,
      });
    } catch (err) {
      if (err instanceof GiftCardError) return c.json({ detail: err.message }, err.status);
      throw err;
    }
  };

  /**
   * Give back every cent a `redeem` run drew. Idempotent — reversing twice is a no-op — because
   * a failed remote payment can be reported more than once and the balance must land exactly.
   */
  reverse = async (c: Context) => {
    const parsed = ReverseRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ detail: "reverse requires a run_id" }, 400);
    await reverseSettlement(parsed.data.run_id);
    return c.json({ ok: true, run_id: parsed.data.run_id });
  };
}
