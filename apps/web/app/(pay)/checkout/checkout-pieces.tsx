/**
 * Presentational building blocks and terminal states for the checkout flow.
 *
 * Boundary: renders already-decided checkout state and never performs merchant mutations.
 * Invariants: payment outcomes describe only the instruments actually presented.
 */

import Link from "next/link";

import { Button, Container, Panel } from "@/components/ui";

import summaryStyles from "./order-summary.module.css";
import styles from "./page.module.css";
import type { Session, StoreError } from "./session";

export function labelForTotal(type: string): string {
  if (type === "fulfillment") return "Delivery";
  if (type === "tax") return "Tax";
  if (type === "discount") return "Discount";
  return type.replace(/_/g, " ");
}

/** The tick used both in a step marker and inline in the gift-card status line. */
export function CheckMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8.5 6.2 11.7 13 4.9" />
    </svg>
  );
}

/** One step in the checkout's connected progress spine. */
export function Step({
  index,
  title,
  done,
  muted,
  last,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  muted?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={styles.step}
      data-muted={muted || undefined}
      data-done={done || undefined}
      data-last={last || undefined}
    >
      <div className={styles.stepHead}>
        <span className={styles.stepIndex} data-done={done || undefined} aria-hidden>
          {done ? <CheckMark /> : index}
        </span>
        <h2 className={styles.stepTitle}>{title}</h2>
      </div>
      <div className={styles.stepBody}>{children}</div>
    </section>
  );
}

/** Describes the settlement order for the instruments the buyer actually configured. */
export function SettlementOrder({ hasGift, hasCard }: { hasGift: boolean; hasCard: boolean }) {
  if (!hasGift && !hasCard) return null;

  const steps: string[] = [];
  if (hasGift) {
    steps.push(
      "The gift card is drawn open-amount — the store takes what the card holds, up to the total, and never more.",
    );
  }
  if (hasCard) {
    steps.push(
      hasGift
        ? "The card is authorized for whatever the gift card left behind."
        : "The card is authorized for the full amount.",
    );
  }
  steps.push(
    hasGift
      ? "Both are captured against one order. If any part fails, every gift-card draw in the attempt is reversed."
      : "It is captured against one order. If any part fails, nothing is captured.",
  );

  return (
    <div className={summaryStyles.settlement}>
      <p className={summaryStyles.settlementHead}>When you press pay</p>
      <ol className={summaryStyles.settlementList}>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

/** The loading state is the shape of the summary that's coming, not a spinner. */
export function SkeletonSummary() {
  return (
    <Panel className={styles.skeleton} aria-hidden>
      <span className={`${styles.bar} ${styles.barWide}`} />
      <span className={styles.bar} />
      <span className={`${styles.bar} ${styles.barShort}`} />
    </Panel>
  );
}

/** Reports a declined attempt and the corresponding funding-restoration guarantee. */
export function Declined({ error, hadGift }: { error: StoreError; hadGift: boolean }) {
  return (
    <div className={summaryStyles.declined} role="alert">
      <p className={summaryStyles.declinedTitle}>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.2M12 16.3v.2" />
        </svg>
        Not paid
        {error.code && <code className={summaryStyles.declinedCode}>{error.code}</code>}
      </p>
      <p className={summaryStyles.declinedBody}>{error.detail}</p>
      <p className={summaryStyles.declinedRestore}>
        {hadGift ? (
          <>
            <strong>Every gift-card draw in this attempt was reversed.</strong> Your balances
            are exactly what they were before you pressed pay, and no card was captured.
          </>
        ) : (
          <>
            <strong>Nothing was taken.</strong> No gift card was presented, and no card was
            captured.
          </>
        )}
      </p>
    </div>
  );
}

/** The successful terminal state, rendered only after the merchant returns an order. */
export function Paid({ session }: { session: Session }) {
  const orderId = session.order?.id;
  return (
    <Container narrow>
      <div className={`${styles.standalone} rise`}>
        <span className={styles.paidMark} aria-hidden>
          <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12.5 9.5 18 20 6.5" />
          </svg>
        </span>
        <h1 className={styles.paidTitle}>Paid.</h1>
        <p className={styles.emptyBody}>
          The gift cards settled first and the card covered the remainder. Both are recorded
          against one order in an append-only ledger.
        </p>

        {orderId && (
          <Panel tone="sunk" className={styles.orderPanel}>
            <p className={styles.orderLabel}>Order</p>
            <p className={styles.orderId}>{orderId}</p>
          </Panel>
        )}

        <div className={styles.paidActions}>
          <Button href="/" size="lg">
            Back to the shop
          </Button>
          <Link href="/wallet" className={styles.paidLink}>
            See what&rsquo;s left in the wallet
          </Link>
        </div>
      </div>
    </Container>
  );
}
