/**
 * The run timeline — the full story of one payment attempt: the append-only audit trail and
 * the signed mandates it produced. If the run is still waiting on a human, the decide action
 * lives right here too, not just in the inbox.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityActions } from "@/components/activity-actions";
import { ActivityMandates } from "@/components/activity-mandates";
import { ActivityTimeline } from "@/components/activity-timeline";
import { ApprovalReasonLine } from "@/components/activity-reason";
import { formatClock } from "@/components/activity-format";
import { RunStatusBadge } from "@/components/activity-status-badge";
import { Container, Money, Panel, SectionLabel } from "@/components/ui";
import { runDetail } from "@/lib/consent";

import styles from "./run-detail.module.css";

const DECIDED_BY = "arpitaa_das@yahoo.com";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { runId } = await params;
  const detail = await runDetail(runId);
  return {
    title: detail ? `${detail.run.description} — Activity — pay-agent` : "Run not found — pay-agent",
  };
}

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: PageProps) {
  const { runId } = await params;
  const detail = await runDetail(runId);
  if (!detail) notFound();

  const { run, events, mandates, approval } = detail;
  const isPending = approval?.status === "pending";

  return (
    <Container className={styles.wrap}>
      <Link href="/activity" className={styles.back}>
        ← Activity
      </Link>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <SectionLabel>{run.destinationId}</SectionLabel>
          <RunStatusBadge status={run.status} />
        </div>
        <h1 className={styles.title}>{run.description}</h1>
        <Money minor={run.amountMinor} currency={run.currency} className={styles.amount} />
        <p className={styles.meta}>
          Reference <code className={styles.ref}>{run.reference}</code>
          <span className={styles.dot} aria-hidden>
            ·
          </span>
          Started {formatClock(run.createdAt)}
        </p>

        {isPending && approval && (
          <Panel tone="sunk" className={styles.decidePanel}>
            <p className={styles.decideReason}>
              <ApprovalReasonLine approval={approval} destinationId={run.destinationId} />
            </p>
            <ActivityActions runId={run.id} decidedBy={DECIDED_BY} size="lg" />
          </Panel>
        )}
      </header>

      <div className={styles.grid}>
        <section aria-labelledby="timeline-heading">
          <h2 id="timeline-heading" className={styles.sectionTitle}>
            Audit trail
          </h2>
          <Panel className={styles.timelinePanel}>
            <ActivityTimeline events={events} />
          </Panel>
        </section>

        <section aria-labelledby="mandates-heading">
          <h2 id="mandates-heading" className={styles.sectionTitle}>
            Signed mandates
          </h2>
          <ActivityMandates mandates={mandates} />
        </section>
      </div>
    </Container>
  );
}
