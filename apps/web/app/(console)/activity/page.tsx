/** The consent dashboard's home: the approval inbox, then every run's audit trail one click away. */

import type { Metadata } from "next";

import { Container, SectionLabel } from "@/components/ui";
import { formatRelative } from "@/components/activity-format";
import { ActivityInbox, type InboxItem } from "@/components/activity-inbox";
import { ActivityRunsList } from "@/components/activity-runs-list";
import { listRuns, pendingApprovals } from "@/lib/consent";

import styles from "./activity-page.module.css";

export const metadata: Metadata = {
  title: "Activity — pay-agent",
  description: "The approval inbox and audit trail for everything the agent has tried to pay.",
};

export const dynamic = "force-dynamic";

// The signed-in reviewer. A real deployment would read this from a session; this dashboard
// has exactly one human in the loop, so it is named once, here.
const DECIDED_BY = "arpitaa_das@yahoo.com";

export default async function ActivityPage() {
  const [pending, runs] = await Promise.all([pendingApprovals(), listRuns(50)]);
  const now = new Date();

  // Oldest-raised-first — whoever has been waiting longest gets attention first, same as any
  // real approval queue.
  const items: InboxItem[] = [...pending]
    .sort((a, b) => a.approval.createdAt.localeCompare(b.approval.createdAt))
    .map(({ approval, run }) => ({
      approval,
      run,
      raisedLabel: formatRelative(approval.createdAt, now),
    }));

  return (
    <Container className={styles.wrap}>
      <header className={styles.head}>
        <SectionLabel>Activity</SectionLabel>
        <h1 className={styles.title}>What the agent has tried to pay</h1>
        <p className={styles.lead}>
          Every run the agent starts lands here — halted for your decision the moment it trips
          a policy, and fully audited whether it settles, fails, or waits on you.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="inbox-heading">
        <div className={styles.sectionHead}>
          <h2 id="inbox-heading" className={styles.sectionTitle}>
            Approval inbox
          </h2>
          {items.length > 0 && (
            <span className={styles.sectionCount}>
              {items.length} waiting
            </span>
          )}
        </div>
        <ActivityInbox items={items} decidedBy={DECIDED_BY} />
      </section>

      <section className={styles.section} aria-labelledby="runs-heading">
        <div className={styles.sectionHead}>
          <h2 id="runs-heading" className={styles.sectionTitle}>
            Recent runs
          </h2>
        </div>
        <ActivityRunsList runs={runs} now={now} />
      </section>
    </Container>
  );
}
