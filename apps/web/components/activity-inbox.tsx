/**
 * The approval inbox — the urgent zone at the top of `/activity`. Each pending run is a card
 * with the amount as the loudest thing on it, the human reason underneath, and physical
 * Approve/Deny actions. A client component because deciding is interactive; the server page
 * hands it plain, pre-formatted data so there is nothing left to fetch on mount.
 */
"use client";

import Link from "next/link";

import { Money, Panel, SectionLabel } from "@/components/ui";
import type { Approval, Run } from "@/lib/consent";

import { ActivityActions } from "./activity-actions";
import { ApprovalReasonLine } from "./activity-reason";
import styles from "./activity-inbox.module.css";

export interface InboxItem {
  approval: Approval;
  run: Run;
  raisedLabel: string;
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="6" width="17" height="13" rx="2.5" opacity="0.45" />
      <path d="M3.5 12.5h4.6l1.6 2.6h4.6l1.6-2.6h4.6" />
    </svg>
  );
}

export function ActivityInbox({ items, decidedBy }: { items: InboxItem[]; decidedBy: string }) {
  if (items.length === 0) {
    return (
      <Panel tone="sunk" className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden>
          <InboxIcon />
        </span>
        <p className={styles.emptyTitle}>Nothing needs your approval</p>
        <p className={styles.emptyBody}>
          A run lands here when it goes over your spend cap or reaches a destination that
          isn&rsquo;t on your allowlist, and waits until you decide. Everything the agent has
          tried recently is clear — see it in Recent runs below.
        </p>
      </Panel>
    );
  }

  return (
    <ul className={styles.list}>
      {items.map(({ approval, run, raisedLabel }) => (
        <li key={run.id} className={`${styles.card} rise`}>
          <div className={styles.cardMeta}>
            <SectionLabel>Approval needed</SectionLabel>
            <span className={styles.raised}>Raised {raisedLabel}</span>
          </div>

          <Money minor={run.amountMinor} currency={run.currency} className={styles.amount} />

          <p className={styles.destination}>
            {run.description}
            <span className={styles.destTag}>{run.destinationId}</span>
          </p>

          <p className={styles.reason}>
            <ApprovalReasonLine approval={approval} destinationId={run.destinationId} />
          </p>

          <div className={styles.cardActions}>
            <ActivityActions runId={run.id} decidedBy={decidedBy} />
            <Link href={`/activity/${run.id}`} className={styles.detailLink}>
              View timeline →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
