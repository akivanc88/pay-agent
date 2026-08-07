/** The full run ledger beneath the inbox — every attempt, newest first, each row a link into
 *  its timeline. Pure presentation; no interactivity needed, so this stays a server component. */

import Link from "next/link";

import { Money, Panel } from "@/components/ui";
import type { Run } from "@/lib/consent";

import { formatRelative } from "./activity-format";
import { RunStatusBadge } from "./activity-status-badge";
import styles from "./activity-runs-list.module.css";

function Chevron() {
  return (
    <svg
      className={styles.chevron}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function ActivityRunsList({ runs, now = new Date() }: { runs: Run[]; now?: Date }) {
  if (runs.length === 0) {
    return (
      <Panel tone="sunk" className={`${styles.panel} ${styles.empty}`}>
        <p className={styles.emptyTitle}>No runs yet</p>
        <p className={styles.emptyBody}>
          Once the agent attempts a payment, it shows up here — settled, failed, or waiting on
          you — with the full audit trail behind it.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className={styles.panel}>
      <div className={styles.head} aria-hidden="true">
        <span className={styles.headStatus}>Status</span>
        <span className={styles.headMain}>Run</span>
        <span className={styles.headWhen}>When</span>
        <span className={styles.headAmount}>Amount</span>
      </div>
      <ul className={styles.list}>
        {runs.map((run) => (
          <li key={run.id}>
            <Link href={`/activity/${run.id}`} className={styles.row}>
              <span className={styles.status}>
                <RunStatusBadge status={run.status} />
              </span>
              <span className={styles.main}>
                <span className={styles.title}>{run.description}</span>
                <span className={styles.sub}>
                  {run.destinationId}
                  <span aria-hidden>·</span>
                  {run.reference}
                </span>
              </span>
              <span className={styles.when}>{formatRelative(run.updatedAt, now)}</span>
              <Money minor={run.amountMinor} currency={run.currency} className={styles.amount} />
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
