/**
 * The planner — destination-independent by construction.
 *
 * The whole run is six steps: discover → capabilities → plan the mix → issue a mandate → pay →
 * confirm. Read this function and note what is *absent*: there is no `if (destination is a
 * storefront) … else if (payment link) …`. The planner branches on `capabilities()` — on what a
 * destination *accepts* — never on which destination it *is*. Two clean poles (a spec-native
 * storefront and an external rail) go through this identical code; the adapters absorb every
 * difference. That is the architectural claim the capstone exists to make, and the planner-
 * independence test asserts it against this file rather than taking it on faith.
 */
import type {
  AmountDue,
  AcceptedInstruments,
  Funding,
  InstrumentPlan,
  Mandate,
  PaymentDestination,
  PaymentResult,
  PaymentStatus,
} from "./destination.js";
import { drawUpTo, formatMinor, type Minor } from "./money.js";

/** Everything one run produced, for the log and the tests. */
export interface RunResult {
  readonly due: AmountDue;
  readonly capabilities: AcceptedInstruments;
  readonly plan: InstrumentPlan;
  readonly mandate: Mandate;
  readonly result: PaymentResult;
  readonly status: PaymentStatus;
  readonly log: readonly string[];
}

/**
 * Work out the instrument mix the way the merchant works it out: the gift card is drawn first,
 * open-amount, up to whatever it holds; the card rail authorizes the remainder. A gift card that
 * covers everything means the card is never touched; a zero-balance card is a valid $0 draw, not
 * a failure (UCP is explicit on this).
 *
 * The plan is the same regardless of whether the destination redeems the gift card itself or the
 * draw happens on our own ledger — that difference is the adapter's to execute in `pay`, not the
 * planner's to know. Balance is a *hint*: this plans against it, and the real draw is reconciled
 * from what the destination reports back.
 */
export function planInstruments(
  due: AmountDue,
  caps: AcceptedInstruments,
  funding: Funding,
): InstrumentPlan {
  const amount = due.amountMinor;
  const gift = funding.giftCard;

  // One currency across the whole plan. The gift ledger settles in the destination's advertised
  // currency; drawing it against an amount quoted in a different currency would be a silent 1:1
  // conversion, which is inventing an amount. Refuse rather than mix.
  if (caps.currency !== due.currency) {
    throw new CurrencyMismatch(
      `destination is owed ${due.currency} but accepts ${caps.currency}; this agent does not convert`,
      due,
    );
  }

  // The gift card can only be planned up to a *known* balance. An unknown (null) hint plans no
  // draw rather than guessing a number — the honesty rule made mechanical.
  const giftAvailable: Minor = gift && gift.hintMinor !== null ? gift.hintMinor : 0;
  const giftDraw = gift ? drawUpTo(amount, giftAvailable) : 0;

  const afterGift = amount - giftDraw;
  // The card leg exists only where the destination will actually take a card *and* the user
  // granted one — branching on capability, which is the planner's job, not on identity.
  const cardAmount = caps.acceptsCard && funding.card ? afterGift : 0;
  const uncovered = afterGift - cardAmount;

  return {
    amountMinor: amount,
    currency: due.currency,
    giftDrawMinor: giftDraw,
    cardMinor: cardAmount,
    uncoveredMinor: uncovered,
    giftCard: gift,
    card: funding.card,
  };
}

/** A simplified, honestly-unsigned mandate. M3 signs it; here it attests to the exact amount. */
export function makeMandate(due: AmountDue): Mandate {
  return {
    reference: due.reference,
    destinationId: due.destinationId,
    amountMinor: due.amountMinor,
    currency: due.currency,
    createdAt: new Date().toISOString(),
    signed: false,
  };
}

export interface RunOptions {
  /**
   * A spend cap in minor units. Over it, the run halts *before* any instrument is touched and
   * asks for approval — the human-in-the-loop moment. Absent means no cap (M2 default; the real
   * policy gate and approval inbox are M3).
   */
  readonly spendCapMinor?: Minor;
}

export class ApprovalRequired extends Error {
  readonly due: AmountDue;
  constructor(message: string, due: AmountDue) {
    super(message);
    this.name = "ApprovalRequired";
    this.due = due;
  }
}

/** The destination's currency does not match the amount it quoted. Refused, never converted. */
export class CurrencyMismatch extends Error {
  readonly due: AmountDue;
  constructor(message: string, due: AmountDue) {
    super(message);
    this.name = "CurrencyMismatch";
    this.due = due;
  }
}

/**
 * Run a payment against any destination.
 *
 * The reference is a cart id, a payment URL, or a biller account — the planner does not care
 * which, because `discover` normalizes it. Nothing here is destination-specific.
 */
export async function runPayment(
  destination: PaymentDestination,
  reference: string,
  funding: Funding,
  options: RunOptions = {},
): Promise<RunResult> {
  const log: string[] = [];

  const due = await destination.discover(reference);
  log.push(`discover → ${due.description}: ${formatMinor(due.amountMinor, due.currency)}`);

  // Policy gate. In M2 it is only the spend cap; the destination allowlist and the approval inbox
  // land in M3. It fires *before* capabilities or any instrument work, so an over-cap run writes
  // nothing before it halts.
  if (options.spendCapMinor !== undefined && due.amountMinor > options.spendCapMinor) {
    throw new ApprovalRequired(
      `amount ${formatMinor(due.amountMinor, due.currency)} exceeds the ` +
        `${formatMinor(options.spendCapMinor, due.currency)} spend cap`,
      due,
    );
  }

  const capabilities = await destination.capabilities();
  const plan = planInstruments(due, capabilities, funding);
  log.push(
    `plan → gift ${formatMinor(plan.giftDrawMinor, plan.currency)}, ` +
      `card ${formatMinor(plan.cardMinor, plan.currency)}` +
      (plan.uncoveredMinor > 0
        ? `, UNCOVERED ${formatMinor(plan.uncoveredMinor, plan.currency)}`
        : ""),
  );

  if (plan.uncoveredMinor > 0) {
    throw new ApprovalRequired(
      `${formatMinor(plan.uncoveredMinor, plan.currency)} of the total is covered by no ` +
        `instrument the agent holds`,
      due,
    );
  }

  const mandate = makeMandate(due);
  const result = await destination.pay(plan, mandate, due);
  log.push(
    result.ok
      ? `pay → ok (${result.detail})`
      : `pay → FAILED (${result.detail})` + (result.reversed ? "; gift draw reversed" : ""),
  );

  // Only a successful pay is worth independently confirming — the point of confirm is to distrust
  // pay's own ok:true and ask the destination what really happened. A payment that already failed
  // and unwound is not settled by definition; re-asking the destination about a non-existent
  // charge would only invite a misleading "settled".
  const status: PaymentStatus = result.ok
    ? await destination.confirm(result.handle)
    : { settled: false, handle: result.handle, detail: result.detail };
  log.push(`confirm → ${status.settled ? "settled" : "not settled"} (${status.detail})`);

  return { due, capabilities, plan, mandate, result, status, log };
}
