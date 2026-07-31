import type { MinorUnits } from "./money.js";

/**
 * Two gift-card families, deliberately distinct types.
 *
 * Conflating them is the easiest way to get this project wrong: they are different
 * instruments with different redeemers. A closed-loop card is redeemed by *us* against
 * our own ledger; an open-loop prepaid card is redeemed by the *card network* and is,
 * as far as anyone else is concerned, just a card.
 */
export type CardFamily = "closed_loop" | "open_loop";

/**
 * A closed-loop gift card issued by our own storefront.
 *
 * We store a deterministic lookup hash of the code (so a presented code can be found),
 * a slow hash of the PIN (so it can be verified but not recovered), and last4 for
 * display. The raw pair is never stored — the merchant only ever *verifies* a presented
 * credential, it never needs to re-present it, so one-way is correct here.
 */
export interface ClosedLoopCard {
  readonly id: string;
  readonly family: "closed_loop";
  readonly userId: string;
  /** HMAC of the normalised code. Deterministic, so it can be looked up. */
  readonly codeLookupHash: string;
  /** Slow hash of the PIN, with its own salt. Not reversible. */
  readonly pinHash: string;
  readonly pinSalt: string;
  readonly last4: string;
  readonly currency: string;
  readonly createdAt: string;
}

/**
 * An open-loop prepaid card (a real Visa gift card).
 *
 * We never see the PAN: it is captured by Stripe Elements in the browser and we hold
 * only a PaymentMethod id. `enrolledBalance` is what the *user told us* — no API can
 * query an open-loop prepaid balance, so it is a planning hint and nothing more.
 */
export interface OpenLoopCard {
  readonly id: string;
  readonly family: "open_loop";
  readonly userId: string;
  /** Stripe PaymentMethod id (`pm_…`). This is the entire enrollment. */
  readonly paymentMethodId: string;
  readonly brand: string;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
  /**
   * User-reported balance. **Unverified, and expected to drift from reality.**
   * The planner may use it to plan; it must still handle a decline gracefully.
   */
  readonly enrolledBalance: MinorUnits;
  readonly balanceVerified: false;
  /** Set once a decline proves the enrolled figure wrong. */
  readonly balanceStale: boolean;
  readonly currency: string;
  readonly createdAt: string;
}

export type GiftCard = ClosedLoopCard | OpenLoopCard;

/**
 * Ledger entry kinds.
 *
 * `issue` and `reverse` are credits; `redeem` is a debit. There is no `adjust` and no
 * mutable balance column: the balance of a card is the signed sum of its entries. That
 * is what lets a reversal restore a balance *exactly* rather than approximately.
 */
export type LedgerEntryKind = "issue" | "redeem" | "reverse";

export interface LedgerEntry {
  /**
   * Insertion order, and the only ordering that is meaningful.
   *
   * Entries in one run are routinely written inside the same millisecond, so timestamps
   * cannot order them and a tie-break on a random id orders them at random.
   */
  readonly seq: number;
  readonly id: string;
  readonly cardId: string;
  readonly kind: LedgerEntryKind;
  /** Always non-negative. The kind determines the sign applied to it. */
  readonly amount: MinorUnits;
  readonly currency: string;
  /** Groups the entries belonging to one payment attempt, so a run can be reversed. */
  readonly runId: string | null;
  /** For `reverse`, the id of the `redeem` entry being undone. */
  readonly reversesEntryId: string | null;
  readonly createdAt: string;
}

/** The signed contribution an entry makes to a card's balance. */
export function signedAmount(entry: LedgerEntry): number {
  return entry.kind === "redeem" ? -entry.amount : entry.amount;
}

/**
 * The result of drawing against a card.
 *
 * Per UCP, gift cards are submitted **open-amount**: the merchant draws up to the
 * available balance rather than being told an exact figure. So a draw can legitimately
 * return less than was requested — including zero.
 */
export interface DrawResult {
  readonly cardId: string;
  /** What was actually drawn. May be less than requested, and zero is valid. */
  readonly drawn: MinorUnits;
  /** The ledger entry recording the draw, or null when nothing was drawn. */
  readonly entryId: string | null;
  readonly balanceAfter: MinorUnits;
}
