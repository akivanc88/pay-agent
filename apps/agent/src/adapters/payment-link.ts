/**
 * The Stripe payment-link adapter — the external-rail pole.
 *
 * This is the "real rails" leg: the destination is a merchant that did *not* issue our gift card
 * and cannot redeem it, so the split happens on our side. The gift card is drawn on our own store's
 * ledger first; the remainder is settled as a genuine Stripe PaymentIntent in test mode; and if that
 * card leg declines, the gift draw is reversed so the balance lands exactly. One planner reaches
 * this destination with the same four methods it uses for the storefront — the whole point.
 *
 * Honest about what it is: a Stripe Payment Link is a hosted page a human pays, and we do not drive
 * that page headlessly. The link *communicates the amount* (read from Stripe's API by the link's id),
 * and settling it is a real authorization-and-capture on the card rail. Nothing here mocks a success.
 */
import Stripe from "stripe";

import type {
  AcceptedInstruments,
  AmountDue,
  InstrumentPlan,
  Mandate,
  PaymentDestination,
  PaymentResult,
  PaymentStatus,
} from "../destination.js";
import type { Minor } from "../money.js";

/** Pull a `plink_…` id out of whatever reference the agent was handed. */
function paymentLinkId(reference: string): string {
  const match = reference.match(/plink_[A-Za-z0-9]+/);
  if (match) return match[0];
  if (reference.startsWith("plink_")) return reference;
  throw new Error(
    `payment-link reference must be a Stripe payment link id (plink_…); got "${reference}"`,
  );
}

async function redeemGift(
  storeBase: string,
  gift: { code: string; pin: string },
  amountMinor: Minor,
): Promise<{ runId: string; drawnMinor: Minor }> {
  const res = await fetch(`${storeBase}/funding/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: gift.code, pin: gift.pin, amount_minor: amountMinor }),
  });
  const body = (await res.json()) as { run_id?: string; drawn_minor?: number; detail?: string };
  if (!res.ok || !body.run_id) {
    throw new Error(body.detail ?? `gift-card redeem failed (${res.status})`);
  }
  return { runId: body.run_id, drawnMinor: body.drawn_minor ?? 0 };
}

async function reverseGift(storeBase: string, runId: string): Promise<void> {
  await fetch(`${storeBase}/funding/reverse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  }).catch(() => undefined);
}

export function stripePaymentLink(opts: {
  secretKey: string;
  storeBaseUrl: string;
}): PaymentDestination {
  // Test mode only. A live key in here is refused outright — the same mechanical guard the store
  // uses, because an agent settling real money against a link is not what M2 is.
  if (!opts.secretKey.startsWith("sk_test_")) {
    throw new Error(
      "payment-link adapter is test-mode only; its key must be an sk_test_… key",
    );
  }
  const stripe = new Stripe(opts.secretKey, {
    appInfo: { name: "pay-agent-agent", url: "https://github.com/ashis-majumder/pay-agent" },
  });
  const storeBase = opts.storeBaseUrl.replace(/\/$/, "");

  return {
    id: "stripe-payment-link",

    /** Read the amount owed from the link itself, via Stripe — never scraped, never hardcoded. */
    async discover(reference: string): Promise<AmountDue> {
      const id = paymentLinkId(reference);
      const items = await stripe.paymentLinks.listLineItems(id, { limit: 100 });
      let amountMinor = 0;
      let currency = "";
      for (const item of items.data) {
        // amount_total is the line's quantity × unit price in minor units, tax included.
        amountMinor += item.amount_total;
        currency = item.currency ?? currency;
      }
      if (amountMinor <= 0 || !currency) {
        throw new Error(`payment link ${id} exposed no payable amount`);
      }
      return {
        destinationId: this.id,
        reference,
        amountMinor,
        currency: currency.toUpperCase(),
        description: `hosted payment link ${id}`,
        handle: id,
      };
    },

    /** An external merchant: it takes a card, and it cannot redeem our closed-loop gift card. */
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: false, acceptsCard: true };
    },

    /**
     * Draw the gift card on our ledger, settle the remainder on the card rail, and — if that leg
     * fails — reverse the draw. The gift draw and its reversal are the failure-safety spine: once
     * money is drawn, anything that throws before the card settles hands it straight back.
     */
    async pay(plan: InstrumentPlan, _mandate: Mandate, due: AmountDue): Promise<PaymentResult> {
      let giftRunId: string | null = null;
      let giftDrawn: Minor = 0;

      if (plan.giftDrawMinor > 0 && plan.giftCard) {
        const drawn = await redeemGift(storeBase, plan.giftCard, plan.giftDrawMinor);
        giftRunId = drawn.runId;
        giftDrawn = drawn.drawnMinor;
      }

      // The remainder on the card rail. If there is nothing for the card to do (a gift card that
      // covered everything), there is no external leg to run and the draw already settled it.
      if (plan.cardMinor <= 0) {
        return {
          ok: true,
          handle: giftRunId ?? "gift-only",
          detail: `gift card covered the whole ${due.description}`,
          giftDrawnMinor: giftDrawn > 0 ? giftDrawn : null,
          cardChargedMinor: 0,
          reversed: false,
        };
      }

      if (!plan.card) {
        if (giftRunId) await reverseGift(storeBase, giftRunId);
        return {
          ok: false,
          handle: "",
          detail: "a remainder is owed but no card was granted for the external rail",
          giftDrawnMinor: null,
          cardChargedMinor: null,
          reversed: giftRunId !== null,
        };
      }

      try {
        const intent = await stripe.paymentIntents.create(
          {
            amount: plan.cardMinor,
            currency: due.currency.toLowerCase(),
            payment_method: plan.card.token,
            confirm: true,
            // The buyer is not at a browser — an agent is settling this. `off_session` is Stripe's
            // own name for that, and it makes a decline here a genuine issuer decline.
            off_session: true,
            automatic_payment_methods: { enabled: true, allow_redirects: "never" },
            metadata: { destination: this.id, payment_link: due.handle },
          },
          { idempotencyKey: `${due.handle}:${plan.cardMinor}:${plan.card.token}` },
        );

        if (intent.status !== "succeeded") {
          throw new Error(`card authorization did not settle (status: ${intent.status})`);
        }

        return {
          ok: true,
          handle: intent.id,
          detail: `settled ${plan.cardMinor} on ${intent.id}`,
          giftDrawnMinor: giftDrawn > 0 ? giftDrawn : null,
          cardChargedMinor: plan.cardMinor,
          reversed: false,
        };
      } catch (err) {
        // The card leg failed after the gift card was drawn: hand every cent back.
        if (giftRunId) await reverseGift(storeBase, giftRunId);
        const detail =
          err instanceof Stripe.errors.StripeError
            ? `${err.code ?? err.type}: ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        return {
          ok: false,
          handle: "",
          detail,
          giftDrawnMinor: null,
          cardChargedMinor: null,
          reversed: giftRunId !== null,
        };
      }
    },

    /** Ask Stripe what became of the charge, rather than trusting `pay`'s return. */
    async confirm(handle: string): Promise<PaymentStatus> {
      if (!handle.startsWith("pi_")) {
        // No card leg ran (gift covered it all), so there is nothing on Stripe to confirm.
        return { settled: true, handle, detail: "no card leg — gift card settled it" };
      }
      const intent = await stripe.paymentIntents.retrieve(handle);
      return {
        settled: intent.status === "succeeded",
        handle,
        detail: `payment intent ${intent.status}`,
      };
    },
  };
}
