/** Shown when a run id doesn't exist in the consent store — a stale link should land somewhere
 *  considered, not on a bare 404. */

import { Button, Container, Panel, SectionLabel } from "@/components/ui";

import styles from "./run-not-found.module.css";

export default function RunNotFound() {
  return (
    <Container narrow className={styles.wrap}>
      <Panel inset className={`${styles.panel} rise`}>
        <div className={styles.icon} aria-hidden>
          <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4.3-4.3" />
            <path d="M8.5 11h5" />
          </svg>
        </div>
        <SectionLabel>Not found</SectionLabel>
        <h1 className={styles.title}>We couldn&rsquo;t find that run</h1>
        <p className={styles.lede}>
          The link may be stale, or the run id has a typo. Every run the agent has attempted —
          settled, failed, or waiting on you — is listed on the activity page.
        </p>
        <div className={styles.actions}>
          <Button href="/activity" size="lg">
            Back to activity
          </Button>
        </div>
      </Panel>
    </Container>
  );
}
