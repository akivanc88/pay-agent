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
import { settleExternalRail } from "./external-rail.js";

/** Pull a `plink_…` id out of whatever reference the agent was handed. */
function paymentLinkId(reference: string): string {
  const match = reference.match(/plink_[A-Za-z0-9]+/);
  if (match) return match[0];
  if (reference.startsWith("plink_")) return reference;
  throw new Error(
    `payment-link reference must be a Stripe payment link id (plink_…); got "${reference}"`,
  );
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
     * fails — reverse the draw. The gift draw and its reversal are the failure-safety spine, shared
     * with the StreamCo biller through `settleExternalRail`: once money is drawn, anything that
     * throws before the card settles hands it straight back (except an indeterminate capture).
     */
    async pay(plan: InstrumentPlan, _mandate: Mandate, due: AmountDue): Promise<PaymentResult> {
      const { result } = await settleExternalRail({
        stripe,
        storeBase,
        plan,
        due,
        metadata: { destination: this.id, payment_link: due.handle },
      });
      return result;
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
