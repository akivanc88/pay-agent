import Link from "next/link";
import type { ReactNode } from "react";

import { NavLinks } from "./nav-links";
import styles from "./site-header.module.css";

/**
 * The app shell's header. The web app hosts two things under one roof — the florist
 * storefront a person browses, and the wallet an agent spends from — so the header names
 * the product, `pay-agent`, and the nav moves between its surfaces.
 */
export function SiteHeader({ themeToggle }: { themeToggle: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="pay-agent home">
          <span className={styles.mark} aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              {/* a sprout — funding that grows into a payment */}
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

        <NavLinks />

        <div className={styles.right}>{themeToggle}</div>
      </div>
    </header>
  );
}
