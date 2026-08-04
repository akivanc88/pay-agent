"use client";

import { Badge, Money } from "@/components/ui";
import type { FundingPlan, GiftUnknown } from "./session";
import styles from "./page.module.css";

/**
 * How the amount due will actually be met.
 *
 * This is the surface the whole project is about, so it is the one place where a number is
 * allowed to be missing. A gift card is submitted open-amount — the merchant draws up to
 * whatever the ledger says it holds — so before the draw happens the split is a projection,
 * and where the balance can't be read the projection is honestly blank rather than a guess.
 *
 * The rows read as an argument, top to bottom: this is what you owe, this is what the gift
 * card takes off it, this is what is left for the card. The *first* row carries the weight,
 * because the amount due is the commitment — the split below it is the explanation of how
 * that one number gets met, and no line of the explanation should out-shout it.
 *
 * A blank is not enough on its own. "Not yet known" with no reason reads as a broken lookup,
 * and the reason is different every time: the code matches nothing enrolled, it matches two
 * cards at once, or the ledger holds a figure it won't vouch for. `unknown` carries which,
 * and the note underneath says it in words.
 */
export function FundingPlanRows({
  plan,
  unknown,
}: {
  plan: FundingPlan;
  unknown: GiftUnknown | null;
}) {
  const notYetKnown = <span className={styles.planUnknown}>not yet known</span>;

  return (
    <dl className={styles.plan}>
      <div className={`${styles.planRow} ${styles.planRowTotal}`}>
        <dt>Amount due</dt>
        <dd>
          {/* Keyed on the value so the settle replays only when the total actually moved —
              picking a faster delivery, say — and not on every unrelated re-render. */}
          <span key={plan.due} className={styles.settle}>
            <Money minor={plan.due} />
          </span>
        </dd>
      </div>

      {plan.hasGift && (
        <div className={styles.planRow}>
          <dt>
            Gift card
            <span className={styles.planHint}>drawn first</span>
          </dt>
          <dd>
            {plan.giftDraw === null ? (
              notYetKnown
            ) : (
              <span key={plan.giftDraw} className={`${styles.planDraw} ${styles.settle}`}>
                &minus;<Money minor={plan.giftDraw} />
              </span>
            )}
          </dd>
        </div>
      )}

      {plan.hasCard && (
        <div className={styles.planRow}>
          <dt>
            Card
            <span className={styles.planHint}>the remainder</span>
          </dt>
          <dd>
            {plan.cardAmount === null ? (
              notYetKnown
            ) : (
              <span key={plan.cardAmount} className={styles.settle}>
                <Money minor={plan.cardAmount} />
              </span>
            )}
          </dd>
        </div>
      )}

      {/* Only ever shown when it is genuinely non-zero: a payment that cannot complete as
          configured. Saying so here is kinder than letting the store refuse it. */}
      {plan.uncovered !== null && plan.uncovered > 0 && (
        <div className={`${styles.planRow} ${styles.planRowShort}`}>
          <dt>
            Not covered
            <Badge tone="danger">short</Badge>
          </dt>
          <dd>
            <Money minor={plan.uncovered} />
          </dd>
        </div>
      )}

      {plan.hasGift && plan.giftDraw === null && unknown && (
        <p className={styles.planNote}>{unknownCopy(unknown)}</p>
      )}

      {plan.hasGift && plan.giftDraw === 0 && (
        <p className={styles.planNote}>
          This card has nothing left on it. It is still valid to present — it simply
          contributes nothing, and the card covers the whole amount.
        </p>
      )}

      {/* Even a number the ledger vouches for is a projection until the draw happens: the
          balance could move between now and pressing pay. Said once, quietly, rather than
          hedged on the row itself. */}
      {plan.hasGift && plan.giftDraw !== null && plan.giftDraw > 0 && (
        <p className={styles.planFoot}>
          That is what the card holds right now. The store draws it at payment and takes no
          more than it holds then.
        </p>
      )}
    </dl>
  );
}

/**
 * The sentence under a blank.
 *
 * Each branch names the real cause. The ambiguous one matters most: two enrolled cards
 * ending in the same four digits is the ordinary case in a demo ledger, and reporting it as
 * "codes are stored hashed" was true of the mechanism but false of this code.
 */
function unknownCopy({ reason, last4, count }: GiftUnknown) {
  switch (reason) {
    case "ambiguous":
      return (
        <>
          {count} enrolled gift cards end <strong>{last4}</strong>, and the rest of a code is
          stored hashed — so this browser cannot tell which one you typed, and it will not
          guess. The store resolves the code when you pay and draws only what that card holds.
        </>
      );
    case "unmatched":
      return (
        <>
          No gift card enrolled in this wallet ends <strong>{last4}</strong>, so there is no
          balance to project here. The store checks the code and PIN when you pay.
        </>
      );
    case "tooShort":
      return (
        <>
          A code has to carry at least four characters before it can be matched against
          anything enrolled. The store checks the code and PIN when you pay.
        </>
      );
    case "stale":
      return (
        <>
          This card&rsquo;s balance was last read a while ago, so it is not projected as
          settled. The store re-reads the ledger at payment.
        </>
      );
    case "unverified":
      return (
        <>
          This card&rsquo;s balance has not been confirmed by the ledger, so it is not
          projected here. The store settles the draw at payment.
        </>
      );
    case "unreadable":
      return (
        <>
          The ledger reported this balance in a form this page cannot read as an amount, so
          it is left blank rather than guessed. The store settles the draw at payment.
        </>
      );
  }
}
