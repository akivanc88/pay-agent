/**
 * Deterministic checkout helpers with no transport, persistence, or environment policy.
 * All monetary inputs and outputs are integer minor units.
 */

import type {
  CheckoutSession,
  GiftCardCredential,
  PaymentInstrument,
  ShippingOption,
  Total,
} from "./types.js";

export const GIFT_CARD_HANDLER_ID = "gift_card";
export const STRIPE_HANDLER_ID = "stripe_payments";

export function amountOf(totals: Total[] | undefined, type: string): number | undefined {
  return totals?.find((total) => total.type === type)?.amount;
}

/** Return the merchant's total, falling back only to its subtotal. */
export function checkoutTotalOf(session: CheckoutSession): number | undefined {
  return amountOf(session.totals, "total") ?? amountOf(session.totals, "subtotal");
}

export function checkoutSubtotalOf(session: CheckoutSession): number | undefined {
  return amountOf(session.totals, "subtotal");
}

export function shippingOptionAmount(option: ShippingOption): number | undefined {
  return amountOf(option.totals, "total");
}

/** Match the completion precondition: every method has a destination and selected groups. */
export function fulfillmentIsComplete(session: CheckoutSession): boolean {
  const methods = session.fulfillment?.methods;
  if (!methods || methods.length === 0) return false;
  return methods.every(
    (method) =>
      Boolean(method.selected_destination_id) &&
      Boolean(method.groups?.every((group) => group.selected_option_id)),
  );
}

/** The minimal line-item body required when a checkout update rebuilds its lines. */
export function lineItemsPayload(session: CheckoutSession) {
  return session.line_items.map((line) => ({
    id: line.id,
    item: { id: line.item.id },
    quantity: line.quantity,
  }));
}

export function normalizeGiftCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export function giftCardInstrument(
  gift: Omit<GiftCardCredential, "type">,
  id = "gift_card_1",
): PaymentInstrument {
  return {
    id,
    type: "gift_card",
    handler_id: GIFT_CARD_HANDLER_ID,
    credential: { type: "gift_card", code: gift.code, pin: gift.pin },
  };
}

export function stripeInstrument(token: string, id = "card_1"): PaymentInstrument {
  return {
    id,
    type: "card",
    handler_id: STRIPE_HANDLER_ID,
    credential: { type: "card", token },
  };
}

/** Gift card is always first; absent instruments are omitted without adding amount fields. */
export function buildPaymentInstruments(
  gift: Omit<GiftCardCredential, "type"> | null,
  cardToken: string | null,
): PaymentInstrument[] {
  const instruments: PaymentInstrument[] = [];
  if (gift) instruments.push(giftCardInstrument(gift));
  if (cardToken) instruments.push(stripeInstrument(cardToken));
  return instruments;
}

export interface KnownBalanceSplit {
  giftDrawMinor: number;
  cardMinor: number;
  uncoveredMinor: number;
}

function nonNegativeMinor(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be non-negative integer minor units, got ${value}`);
  }
  return value;
}

/** Split a known amount gift-first, then onto a card if one is available. */
export function splitKnownBalance(args: {
  amountMinor: number;
  giftBalanceMinor: number;
  useGift: boolean;
  useCard: boolean;
}): KnownBalanceSplit {
  const amount = nonNegativeMinor(args.amountMinor, "amountMinor");
  const balance = nonNegativeMinor(args.giftBalanceMinor, "giftBalanceMinor");
  const giftDrawMinor = args.useGift ? Math.min(amount, balance) : 0;
  const remainder = amount - giftDrawMinor;
  const cardMinor = args.useCard ? remainder : 0;
  return { giftDrawMinor, cardMinor, uncoveredMinor: remainder - cardMinor };
}
