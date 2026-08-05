/** Renders shared storefront footer navigation and project context. */

import Link from "next/link";

import styles from "./site-footer.module.css";

/**
 * The site footer, and the home for disclosure.
 *
 * The storefront is a florist's; the protocol and the sandbox mode are ours. Both facts have
 * to be stated — a demo that hides that it is running Stripe in test mode is dishonest — but
 * they are not hero copy, and no real shop badges its payment processor's sandbox above the
 * fold. Stating them here keeps the disclosure findable and keeps the storefront a shop.
 */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.col}>
          <p className={styles.brand}>
            Fernbank &amp; Co<span className={styles.dot}>·</span>Florist
          </p>
          <p className={styles.note}>
            A demonstration storefront for <strong>pay-agent</strong>. The flowers are
            fictional; the payments are real code.
          </p>
        </div>

        <nav className={styles.col} aria-label="Footer">
          <p className={styles.colTitle}>Browse</p>
          <div className={styles.links}>
            <Link href="/" className={styles.link}>Shop</Link>
            <Link href="/cart" className={styles.link}>Cart</Link>
            <Link href="/checkout" className={styles.link}>Checkout</Link>
            <Link href="/wallet" className={styles.link}>Wallet</Link>
          </div>
        </nav>

        <div className={styles.col}>
          <p className={styles.colTitle}>How it pays</p>
          <p className={styles.note}>
            Checkout speaks <abbr title="Universal Commerce Protocol">UCP</abbr>. Gift cards
            settle against an append-only ledger this store owns; the remainder is authorized
            on a card and captured last.
          </p>
          <p className={styles.disclosure}>
            Card payments run in <strong>Stripe test mode</strong>. No live card is ever
            charged, and no card number reaches this server.
          </p>
        </div>
      </div>

      {/* The base rule. Without it the footer's last line is whichever column happens to be
          tallest, and the page ends on a ragged edge. */}
      <div className={styles.baseline}>
        <div className={styles.baselineInner}>
          <p className={styles.fine}>
            Fernbank &amp; Co is a fictional shop. Prices are in <span className="tnum">CAD</span>.
          </p>
          <p className={styles.fine}>
            Built on <strong>pay-agent</strong> — one funding core, many destinations.
          </p>
        </div>
      </div>
    </footer>
  );
}
