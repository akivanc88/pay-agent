/**
 * The destination contract.
 *
 * This is the spine of the whole capstone: *one funding-and-consent core, many destination
 * adapters*. Every place that wants money — a UCP storefront, a hosted payment link, a biller
 * portal with no API — implements this same four-method shape. Because they all normalize to
 * these types, one planner (see `planner.ts`) pays every one of them without ever branching on
 * which destination it is. That "no branching on destination type" property is the architectural
 * claim the project is here to make, and it lives or dies on this interface staying honest.
 *
 * The agent reaches a destination over HTTP only — no importing merchant code, no shared DB
 * handle. An adapter is the *only* thing that knows a destination's private shape; everything
 * above it sees these normalized types and nothing else.
 */
import type { Minor } from "./money.js";

export type { Minor } from "./money.js";

/**
 * What a destination is owed, normalized. The planner never learns *how* the adapter worked this
 * out — whether it read a machine-readable checkout, parsed a page, or extracted it from a URL.
 */
export interface AmountDue {
  readonly destinationId: string;
  /** The reference the agent was handed: a cart id, a payment URL, a biller account. */
  readonly reference: string;
  readonly amountMinor: Minor;
  /** ISO 4217, e.g. "CAD". */
  readonly currency: string;
  /** A human line for the run log. */
  readonly description: string;
  /**
   * An opaque handle the adapter carries from `discover` into `pay` — a checkout-session id, a
   * payment-link id, whatever this destination needs to resume the *same* transaction it quoted.
   * Nothing above the adapter interprets it.
   */
  readonly handle: string;
}

/**
 * What the destination will accept, normalized to the two instrument families this project cares
 * about. `redeemsGiftCard` is the load-bearing bit: a UCP storefront that *issued* the closed-loop
 * card redeems it itself (the card is submitted to the destination as an instrument); an external
 * rail — a hosted payment link — cannot, so the gift card is drawn on our own ledger first and only
 * the remainder ever reaches that rail. The planner reads this to build the mix; the adapter's
 * `pay` executes it. Reading capabilities is planning, not a branch on the destination's identity.
 */
export interface AcceptedInstruments {
  readonly currency: string;
  readonly redeemsGiftCard: boolean;
  readonly acceptsCard: boolean;
}

/**
 * A gift-card funding source the agent holds on the user's behalf. Closed-loop and issued by our
 * own store, so the agent presents a code the store will redeem — it never holds a raw card
 * number (that rule is the same one all three grounding specs state).
 */
export interface GiftCardFunding {
  readonly code: string;
  readonly pin: string;
  /**
   * The balance the agent *believes* is available, minor units, or null when unknown. A hint for
   * planning only — the real draw is whatever the ledger holds at settlement, which may be less.
   * A closed-loop card's ledger balance is verifiable; an open-loop prepaid card (M4) is not, and
   * `verified` says which.
   */
  readonly hintMinor: Minor | null;
  readonly verified: boolean;
}

/** A card rail the agent can authorize the remainder against, referenced by token — never a PAN. */
export interface CardFunding {
  /** A Stripe test PaymentMethod / a scoped token. The agent never holds the number behind it. */
  readonly token: string;
  readonly label: string;
}

/** The funding the user has granted the agent for a run. */
export interface Funding {
  readonly giftCard: GiftCardFunding | null;
  readonly card: CardFunding | null;
}

/**
 * The mix the planner decided on, in minor units. `giftDrawMinor + cardMinor + uncoveredMinor`
 * always equals `amountMinor`. A non-zero `uncoveredMinor` means no instrument covers the rest and
 * the payment cannot settle as planned — the planner surfaces it rather than quietly paying less.
 */
export interface InstrumentPlan {
  readonly amountMinor: Minor;
  readonly currency: string;
  /** Drawn from the gift card, open-amount, up to what it holds. */
  readonly giftDrawMinor: Minor;
  /** Left for the card rail after the gift card. */
  readonly cardMinor: Minor;
  /** What no instrument covers. Non-zero ⇒ needs approval / cannot settle as-is. */
  readonly uncoveredMinor: Minor;
  readonly giftCard: GiftCardFunding | null;
  readonly card: CardFunding | null;
}

/**
 * A consent mandate.
 *
 * M2 carries the correct fields and the correct names but does **not** sign them — SD-JWT-VC /
 * JWS signing is M3, and `signed: false` says so at the type level so nothing here can imply
 * cryptography that is not present. Naming it a mandate now, honestly unsigned, is the whole point:
 * the shape is right, the guarantee is explicitly weaker, and `docs/DESIGN.md` says which.
 */
export interface Mandate {
  readonly reference: string;
  readonly destinationId: string;
  readonly amountMinor: Minor;
  readonly currency: string;
  readonly createdAt: string;
  readonly signed: false;
}

/**
 * What actually happened, read back from the destination — never asserted by the agent. The
 * amounts are what the destination reports it drew and charged, so the run log states settlement
 * as fact only where the destination confirmed it.
 */
export interface PaymentResult {
  readonly ok: boolean;
  /** Order id / payment id to confirm against. */
  readonly handle: string;
  readonly detail: string;
  readonly giftDrawnMinor: Minor | null;
  readonly cardChargedMinor: Minor | null;
  /**
   * When a payment fails *after* a gift-card draw, whether that draw was reversed. The failure
   * matrix demands the balance come back exactly; this records that it did (or that there was
   * nothing to reverse).
   */
  readonly reversed: boolean;
}

export interface PaymentStatus {
  readonly settled: boolean;
  readonly handle: string;
  readonly detail: string;
}

/**
 * One destination, reached over HTTP only.
 *
 *  - `discover(reference)` — normalize whatever the destination exposes into an `AmountDue`.
 *  - `capabilities()` — what it will accept, so the planner can build the mix.
 *  - `pay(plan, mandate, due)` — settle the planned mix against this destination. `due` carries the
 *    handle from discover so the adapter resumes the same transaction. (The plan interface in the
 *    design doc is `pay(plan, mandate)`; the handle is passed alongside rather than folded into the
 *    mix, which is about instruments, not transport.)
 *  - `confirm(handle)` — ask the destination what became of it, rather than trusting `pay`'s return.
 */
export interface PaymentDestination {
  readonly id: string;
  discover(reference: string): Promise<AmountDue>;
  capabilities(): Promise<AcceptedInstruments>;
  pay(plan: InstrumentPlan, mandate: Mandate, due: AmountDue): Promise<PaymentResult>;
  confirm(handle: string): Promise<PaymentStatus>;
}
