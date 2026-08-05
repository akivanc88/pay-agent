/** Presents the cart's calculated order summary and checkout navigation. */

import Link from "next/link";

import { Button, Money, Panel } from "@/components/ui";

import styles from "./cart-summary.module.css";

type CartSummaryProps = {
  count: number;
  total: number;
  currency: string;
};

export function CartSummary({ count, total, currency }: CartSummaryProps) {
  return (
    <aside className={styles.summaryCol} aria-label="Order summary">
      <Panel className={styles.summary}>
        <h2 className={styles.summaryTitle}>Order summary</h2>
        <dl className={styles.summaryRows} aria-live="polite">
          <div className={styles.summaryRow}>
            <dt>
              Subtotal
              <span className={styles.summaryHint}>
                {count} {count === 1 ? "item" : "items"}
              </span>
            </dt>
            <dd><Money minor={total} currency={currency} /></dd>
          </div>
          <div className={styles.summaryRow} data-muted>
            <dt>Delivery</dt>
            <dd>Calculated at checkout</dd>
          </div>
          <div className={styles.summaryRow} data-muted>
            <dt>Taxes</dt>
            <dd>Calculated at checkout</dd>
          </div>
        </dl>
        <div className={styles.totalBand}>
          <span className={styles.totalLabel}>Estimated total</span>
          <Money minor={total} currency={currency} className={styles.totalAmount} />
        </div>
        <p className={styles.summaryNote}>
          Delivery and taxes are quoted by the shop on the next step, before anything is
          charged. You can pay with a gift card, a card, or both.
        </p>
        <Button href="/checkout" size="lg" full className={styles.checkoutBtn}>
          Continue to checkout
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Button>
        <Link href="/" className={styles.continueLink}>Continue shopping</Link>
      </Panel>
    </aside>
  );
}
