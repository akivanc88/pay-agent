/** Renders the product route's focused missing-item recovery state. */

import { Container, Panel, Button, SectionLabel } from "@/components/ui";
import styles from "./not-found.module.css";

/**
 * Shown when a product id doesn't exist in the catalogue. A wrong or stale link should land
 * somewhere considered, not on a bare 404.
 */
export default function ProductNotFound() {
  return (
    <Container narrow className={styles.wrap}>
      <Panel inset className={`${styles.panel} rise`}>
        <div className={styles.icon} aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21c4-3 7-6.5 7-11a7 7 0 0 0-14 0c0 4.5 3 8 7 11Z" />
            <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
          </svg>
        </div>
        <SectionLabel>Not in the shop</SectionLabel>
        <h1 className={styles.title}>We couldn&rsquo;t find that cutting</h1>
        <p className={styles.lede}>
          The arrangement you followed may have sold out and been retired, or the link picked
          up a typo. Everything we&rsquo;re cutting this week is on the shop page.
        </p>
        <div className={styles.actions}>
          <Button href="/" size="lg">
            Browse the shop
          </Button>
        </div>
      </Panel>
    </Container>
  );
}
