/**
 * Owns browser-visible funding resolution, instrument construction, and gift-first planning.
 * Unknown balances remain `null`; this module never invents a projection the ledger cannot prove.
 */

import {
  buildPaymentInstruments,
  normalizeGiftCode,
  splitKnownBalance,
} from "@pay-agent/protocol";

import type { FundingCard, Instrument } from "./session-types";

/** Build ordered open-amount gift and card instruments with no client-authored amounts. */
export function buildInstruments(
  gift: { code: string; pin: string } | null,
  cardToken: string | null,
): Instrument[] {
  return buildPaymentInstruments(gift, cardToken);
}

/**
 * A last-four match is only a browser projection aid; the merchant verifies full credentials.
 * Ambiguous and unmatched cards remain distinct so the UI can explain exactly what is unknown.
 */
export type GiftCardMatch =
  | { kind: "empty" }
  | { kind: "unmatched"; last4: string }
  | { kind: "ambiguous"; last4: string; count: number }
  | { kind: "matched"; card: FundingCard };

export function resolveGiftCard(code: string, cards: FundingCard[]): GiftCardMatch {
  const normalised = normalizeGiftCode(code);
  if (normalised.length < 4) return { kind: "empty" };

  const last4 = normalised.slice(-4);
  const matches = cards.filter((card) => card.family === "closed_loop" && card.last4 === last4);
  const only = matches[0];
  if (matches.length === 1 && only) return { kind: "matched", card: only };
  if (matches.length === 0) return { kind: "unmatched", last4 };
  return { kind: "ambiguous", last4, count: matches.length };
}

export type UnknownDrawReason =
  | "tooShort"
  | "unmatched"
  | "ambiguous"
  | "unverified"
  | "stale"
  | "unreadable";

export interface GiftUnknown {
  reason: UnknownDrawReason;
  last4?: string;
  count?: number;
}

/** Stripe test PaymentMethods displayed by the checkout; no raw card credential enters the app. */
export interface TestCard {
  token: string;
  brand: string;
  last4: string;
  outcome: string;
  code?: string;
  declines: boolean;
}

export const TEST_CARDS: TestCard[] = [
  { token: "pm_card_visa", brand: "Visa", last4: "4242", outcome: "Authorizes", declines: false },
  {
    token: "pm_card_chargeDeclinedInsufficientFunds",
    brand: "Visa",
    last4: "9995",
    outcome: "Declines",
    code: "insufficient_funds",
    declines: true,
  },
  {
    token: "pm_card_chargeDeclined",
    brand: "Visa",
    last4: "0002",
    outcome: "Declines",
    code: "card_declined",
    declines: true,
  },
];

export interface FundingPlan {
  due: number;
  giftDraw: number | null;
  cardAmount: number | null;
  uncovered: number | null;
  hasGift: boolean;
  hasCard: boolean;
}

export function buildPlan(args: {
  due: number;
  giftBalance: number | null;
  hasGift: boolean;
  hasCard: boolean;
}): FundingPlan {
  const { due, giftBalance, hasGift, hasCard } = args;

  if (!hasGift) {
    return {
      due,
      giftDraw: null,
      cardAmount: hasCard ? due : null,
      uncovered: hasCard ? 0 : due,
      hasGift: false,
      hasCard,
    };
  }

  if (giftBalance === null) {
    return {
      due,
      giftDraw: null,
      cardAmount: null,
      uncovered: hasCard ? 0 : null,
      hasGift: true,
      hasCard,
    };
  }

  const split = splitKnownBalance({
    amountMinor: due,
    giftBalanceMinor: giftBalance,
    useGift: true,
    useCard: hasCard,
  });
  return {
    due,
    giftDraw: split.giftDrawMinor,
    cardAmount: split.cardMinor,
    uncovered: split.uncoveredMinor,
    hasGift: true,
    hasCard,
  };
}

/** True when the plan is knowably short; unknown projections are deliberately not refused. */
export function planFallsShort(plan: FundingPlan): boolean {
  return plan.uncovered !== null && plan.uncovered > 0;
}

export { minorFromDisplay } from "@/lib/money";
