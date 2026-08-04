import Link from "next/link";

import styles from "./pay-header.module.css";

/**
 * The checkout's header.
 *
 * The storefront header carries nav links, a cart count and a theme toggle. None of them
 * belong here. A checkout is amputated on purpose — Stripe's hosted page has no navigation
 * at all, Shopify strips to a mark and a breadcrumb — because every link out of a payment
 * flow is a measured way to lose the payment. What is left is the one thing the customer
 * actually needs to know at this moment: whose checkout this is, and that it is secure.
 *
 * The mark still links home. That is the one escape hatch every reference keeps, because a
 * customer who wants out will find a way out, and a working link is kinder than the back
 * button.
 */
export function PayHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="pay-agent home">
          <span className={styles.mark} aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path
                d="M12 21V11M12 11c0-3.3-2.4-6-6-6.5C5.7 8 8 11 12 11Zm0 0c0-3 2-5.6 5.5-6C17.8 8 15.6 11 12 11Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className={styles.wordmark}>
            pay<span className={styles.dot}>·</span>agent
          </span>
        </Link>

        <p className={styles.secure}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
            <rect
              x="4.5"
              y="10.5"
              width="15"
              height="9.5"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M8 10.5V7.75a4 4 0 1 1 8 0v2.75"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span>Secure checkout</span>
        </p>
      </div>
    </header>
  );
}
