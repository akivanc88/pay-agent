/**
 * Authoritative merchant totals, projected funding split, and checkout submission surface.
 *
 * Boundary: renders a prepared plan and invokes the controller's pay intent. It does not
 * build instruments, mutate a session, or infer totals from cart data.
 */

import { Button, Money } from "@/components/ui";

import { Declined, SettlementOrder, labelForTotal } from "./checkout-pieces";
import { FundingPlanRows } from "./funding-plan";
import {
  subtotalOf,
  type FundingPlan,
  type GiftUnknown,
  type Session,
  type StoreError,
} from "./session";
import styles from "./order-summary.module.css";

export function OrderSummary({
  session,
  plan,
  giftUnknown,
  failure,
  hasGift,
  hasCard,
  due,
  paying,
  canPay,
  payNote,
  onPay,
}: {
  session: Session;
  plan: FundingPlan;
  giftUnknown: GiftUnknown | null;
  failure: StoreError | null;
  hasGift: boolean;
  hasCard: boolean;
  due: number;
  paying: boolean;
  canPay: boolean;
  payNote: string;
  onPay: () => void;
}) {
  return (
    <aside className={styles.aside}>
      <div className={styles.summary}>
        <h2 className={styles.summaryTitle}>Order</h2>

        <ul className={styles.items}>
          {session.line_items.map((line) => (
            <li key={line.id} className={styles.item}>
              <span className={styles.itemQty}>{line.quantity}×</span>
              <span className={styles.itemTitle}>{line.item.title}</span>
              <Money minor={line.item.price * line.quantity} className={styles.itemAmount} />
            </li>
          ))}
        </ul>

        <div className={styles.subtotals}>
          <div className={styles.subtotalRow}>
            <span>Subtotal</span>
            <Money minor={subtotalOf(session)} />
          </div>
          {session.totals
            .filter((total) => total.type !== "subtotal" && total.type !== "total")
            .map((total) => (
              <div key={total.type} className={styles.subtotalRow}>
                <span>{total.display_text ?? labelForTotal(total.type)}</span>
                <Money minor={total.amount} />
              </div>
            ))}
        </div>

        <div className={styles.planWrap}>
          <FundingPlanRows plan={plan} unknown={giftUnknown} />
        </div>

        {failure && <Declined error={failure} hadGift={hasGift} />}

        <Button
          size="lg"
          full
          className={styles.payBtn}
          onClick={onPay}
          disabled={!canPay || paying}
          aria-busy={paying}
        >
          {paying ? (
            <span className={styles.payBusy}>
              <span className={styles.spinner} aria-hidden />
              Authorizing…
            </span>
          ) : (
            <span>
              {failure ? "Try again — pay " : "Pay "}
              <Money minor={due} />
            </span>
          )}
        </Button>

        <p className={styles.payNote} aria-live="polite">{payNote}</p>
        <SettlementOrder hasGift={hasGift} hasCard={hasCard} />
      </div>
    </aside>
  );
}
