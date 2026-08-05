/** Settles closed-loop gift instruments against the append-only ledger with exact reversal. */

import {
  DEFAULT_CURRENCY,
  minorUnits,
  openSqliteStore,
  type DrawResult,
  type MinorUnits,
  type Store,
} from "@pay-agent/db";
import { GIFT_CARD_HANDLER_ID } from "@pay-agent/protocol";

export { GIFT_CARD_HANDLER_ID } from "@pay-agent/protocol";

/**
 * Seller-backed gift cards as a UCP payment instrument.
 *
 * This is the piece the upstream reference implementation leaves open. UCP and ACP both
 * model payment as an **array** of instruments, but the sample only ever reads
 * `payment.instruments[0]` — so a cart paid with a gift card *and* a card is expressible
 * in the protocol yet unhandled in the reference. Settling the whole array is the point of
 * this project, so it is implemented here rather than worked around.
 *
 * The handler follows ACP's seller-backed pattern (`dev.acp.seller_backed.gift_card`):
 * the card is resolved entirely on the seller's backend against the seller's own ledger,
 * and no credential is ever transferred onward to the agent.
 */

export const GIFT_CARD_HANDLER_NAME = "dev.acp.seller_backed.gift_card";

let store: Store | null = null;

/**
 * The funding ledger.
 *
 * Deliberately a different database from the storefront's catalogue: gift-card balances
 * are user-owned funding data, and keeping them separate is what lets the funding core
 * move to Supabase later without dragging the merchant's product tables along.
 */
export function getFundingStore(): Store {
  if (!store) {
    store = openSqliteStore(process.env["FUNDING_DB"] ?? "databases/funding.db");
  }
  return store;
}

/** Test seam — lets a test point the storefront at an in-memory ledger. */
export function setFundingStore(replacement: Store | null): void {
  store = replacement;
}

/**
 * A presented gift-card credential.
 *
 * `type` is widened to `string` rather than the literal `"gift_card"` because this is
 * parsed from a request body — the SDK's schema types it as an open string, and narrowing
 * it here would only push a cast to the call site. It is checked at runtime instead, which
 * is where untrusted input has to be checked anyway.
 */
export interface GiftCardCredential {
  readonly type?: string;
  readonly code?: string;
  readonly pin?: string;
}

export interface SettlementResult {
  /** Groups every ledger draw made for this checkout, so the run can be reversed whole. */
  readonly runId: string;
  readonly totalDue: MinorUnits;
  /** What the gift cards actually covered. May be zero. */
  readonly covered: MinorUnits;
  /** What still needs another rail. Zero means the gift cards covered the lot. */
  readonly remaining: MinorUnits;
  readonly draws: readonly DrawResult[];
}

export class GiftCardError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 402 = 400,
  ) {
    super(message);
    this.name = "GiftCardError";
  }
}

interface Instrument {
  readonly type?: string;
  readonly handler_id?: string;
  readonly credential?: GiftCardCredential;
}

/**
 * Draw every presented gift card against the amount due, in the order presented.
 *
 * Per UCP, gift cards are submitted **open-amount**: we ask each card for what is still
 * owed and take whatever it has. Three consequences that are easy to get wrong, and are
 * therefore explicit here:
 *
 * - A card that covers nothing still contributes **$0 successfully**. A zero balance is a
 *   valid contribution, not a failure, so settlement carries on to the next instrument.
 * - Running out of gift-card balance is **not** an error either. It leaves a `remaining`
 *   for another rail, which is exactly the split payment this project is about.
 * - A bad code or PIN **is** an error, because the buyer asserted something untrue.
 */
export async function settleGiftCards(
  instruments: readonly Instrument[],
  totalDue: MinorUnits,
  runId: string,
): Promise<SettlementResult> {
  const funding = getFundingStore();
  const draws: DrawResult[] = [];
  let remaining: number = totalDue;

  for (const instrument of instruments) {
    if (instrument.type !== "gift_card") continue;

    const credential = instrument.credential;
    if (!credential || credential.type !== "gift_card") {
      throw new GiftCardError("Gift card instrument is missing a gift_card credential");
    }
    const { code, pin } = credential;
    if (!code || !pin) {
      throw new GiftCardError("Gift card credential requires both code and pin");
    }

    const card = await funding.cards.findByCredentials(code, pin);
    if (!card) {
      // Deliberately one message for both "no such card" and "wrong PIN", so this cannot
      // be used to discover which codes exist.
      throw new GiftCardError("Gift card not found, or the PIN is incorrect", 402);
    }

    // Once the total is met, further cards are left untouched rather than drawn to zero.
    const ask = minorUnits(Math.max(remaining, 0));
    const result = await funding.ledger.draw(card.id, ask, runId);
    draws.push(result);
    remaining -= result.drawn;
  }

  return {
    runId,
    totalDue,
    covered: minorUnits(totalDue - remaining),
    remaining: minorUnits(Math.max(remaining, 0)),
    draws,
  };
}

/**
 * Give every drawn balance back.
 *
 * Called whenever a checkout fails after gift cards were drawn — the money must not
 * evaporate because a later step went wrong. Reversing twice is a no-op, which matters
 * because a failure can be reported more than once.
 */
export async function reverseSettlement(runId: string): Promise<void> {
  await getFundingStore().ledger.reverseRun(runId);
}

/** The handler declaration advertised at `/.well-known/ucp`. */
export function giftCardHandlerDeclaration(ucpVersion: string) {
  return {
    id: GIFT_CARD_HANDLER_ID,
    name: GIFT_CARD_HANDLER_NAME,
    version: ucpVersion,
    spec:
      "https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/" +
      "rfcs/rfc.seller_backed_payment_handler.md",
    config_schema: `https://ucp.dev/${ucpVersion}/schemas/shopping/checkout.json`,
    instrument_schemas: [],
    config: {
      currency: DEFAULT_CURRENCY,
      // Open-amount: the buyer does not state how much to take from the card, the
      // merchant draws up to the available balance. This is what makes a gift card
      // combinable with another instrument rather than an all-or-nothing payment.
      open_amount: true,
      combinable: true,
    },
  };
}
