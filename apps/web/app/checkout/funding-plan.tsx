"use client";

import { Badge, Money } from "@/components/ui";
import type { FundingPlan } from "./session";
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
 * card takes off it, this is what is left for the card. The final row is the one the buyer
 * is actually agreeing to, so it gets the weight.
 */
export function FundingPlanRows({ plan }: { plan: FundingPlan }) {
  const unknown = <span className={styles.planUnknown}>not yet known</span>;

  return (
    <dl className={styles.plan}>
      <div className={styles.planRow}>
        <dt>Amount due</dt>
        <dd>
          <Money minor={plan.due} />
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
              unknown
            ) : (
              <span className={styles.planDraw}>
                −<Money minor={plan.giftDraw} />
              </span>
            )}
          </dd>
        </div>
      )}

      {plan.hasCard && (
        <div className={`${styles.planRow} ${styles.planRowFinal}`}>
          <dt>
            Card
            <span className={styles.planHint}>authorized for the remainder</span>
          </dt>
          <dd>{plan.cardAmount === null ? unknown : <Money minor={plan.cardAmount} />}</dd>
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

      {plan.hasGift && plan.giftDraw === null && (
        <p className={styles.planNote}>
          This card&rsquo;s balance can&rsquo;t be read from here, so the split is settled by the
          store at payment. It draws what the card holds and no more.
        </p>
      )}

      {plan.hasGift && plan.giftDraw === 0 && (
        <p className={styles.planNote}>
          This card has nothing left on it. It is still valid to present — it simply
          contributes nothing, and the card covers the whole amount.
        </p>
      )}
    </dl>
  );
}
