/**
 * The append-only audit trail, rendered as a vertical timeline — discovered → … → confirmed,
 * or a decline reversed cleanly. Each event already carries a specific, calm summary line
 * from the orchestrator; this component's job is legibility (an icon appropriate to the kind,
 * a real timestamp) not rewriting the copy.
 */

import type { ComponentType } from "react";

import type { RunEventKind } from "@pay-agent/db";
import type { RunEvent } from "@/lib/consent";

import { formatClock } from "./activity-format";
import {
  IconAlertTriangle,
  IconBanknote,
  IconCard,
  IconCheckCircle,
  IconDoubleCheck,
  IconGift,
  IconHourglass,
  IconInfo,
  IconPen,
  IconRoute,
  IconSearch,
  IconShieldAlert,
  IconShieldCheck,
  IconStamp,
  IconUndo,
  IconXCircle,
} from "./activity-timeline-icons";
import styles from "./activity-timeline.module.css";

type Tone = "brand" | "warn" | "danger" | "gold" | "neutral";

const KIND_META: Record<RunEventKind, { label: string; tone: Tone; Icon: ComponentType<{ className?: string }> }> = {
  discovered: { label: "Discovered", tone: "neutral", Icon: IconSearch },
  policy_passed: { label: "Policy passed", tone: "brand", Icon: IconShieldCheck },
  policy_blocked: { label: "Policy blocked", tone: "danger", Icon: IconShieldAlert },
  approval_requested: { label: "Approval requested", tone: "warn", Icon: IconHourglass },
  approval_granted: { label: "Approval granted", tone: "brand", Icon: IconCheckCircle },
  approval_denied: { label: "Approval denied", tone: "danger", Icon: IconXCircle },
  mandate_issued: { label: "Mandate issued", tone: "brand", Icon: IconPen },
  mandate_verified: { label: "Mandate verified", tone: "brand", Icon: IconStamp },
  planned: { label: "Payment planned", tone: "neutral", Icon: IconRoute },
  // Gold is reserved app-wide for the gift-card moment — this is exactly that moment.
  gift_drawn: { label: "Gift card drawn", tone: "gold", Icon: IconGift },
  gift_reversed: { label: "Gift card reversed", tone: "danger", Icon: IconUndo },
  card_charged: { label: "Card charged", tone: "brand", Icon: IconCard },
  paid: { label: "Paid", tone: "brand", Icon: IconBanknote },
  confirmed: { label: "Confirmed", tone: "brand", Icon: IconDoubleCheck },
  failed: { label: "Failed", tone: "danger", Icon: IconAlertTriangle },
  info: { label: "Info", tone: "neutral", Icon: IconInfo },
};

export function ActivityTimeline({ events }: { events: RunEvent[] }) {
  if (events.length === 0) {
    return <p className={styles.empty}>No activity recorded for this run yet.</p>;
  }

  return (
    <ol className={styles.timeline}>
      {events.map((event, i) => {
        const meta = KIND_META[event.kind] ?? KIND_META.info;
        const Icon = meta.Icon;
        const isLast = i === events.length - 1;
        return (
          <li key={event.id} className={styles.row}>
            <div className={styles.iconCol}>
              <span className={styles.iconWrap} data-tone={meta.tone}>
                <Icon />
              </span>
              {!isLast && <span className={styles.spine} aria-hidden />}
            </div>
            <div className={styles.content}>
              <div className={styles.rowHead}>
                <span className={styles.kind}>{meta.label}</span>
                <time className={styles.time} dateTime={event.createdAt}>
                  {formatClock(event.createdAt)}
                </time>
              </div>
              <p className={styles.summary}>{event.summary}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
