import { Panel, Container } from "./ui";
import styles from "./store-down.module.css";

/**
 * Shown when the storefront API isn't reachable. A demo opened without the store running
 * should say so plainly and tell you how to fix it — never a stack trace, never a blank grid.
 */
export function StoreDown() {
  return (
    <Container narrow className={styles.wrap}>
      <Panel inset className={styles.panel}>
        <div className={styles.icon} aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9h18M3 9l1.5-4.5A2 2 0 0 1 6.4 3h11.2a2 2 0 0 1 1.9 1.5L21 9M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
            <path d="M9 13h6" />
          </svg>
        </div>
        <h2 className={styles.title}>The storefront isn&rsquo;t running</h2>
        <p className={styles.lede}>
          This page reads its catalogue from the UCP merchant in <span className="mono">apps/store</span>.
          Start it, then reload.
        </p>
        <pre className={styles.code}>
          <code>pnpm --filter @pay-agent/store seed{"\n"}pnpm --filter @pay-agent/store dev</code>
        </pre>
      </Panel>
    </Container>
  );
}
