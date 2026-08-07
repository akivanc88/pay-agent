/** Maps a run's lifecycle status to the shared `Badge` — one legend for inbox, list and timeline. */

import type { RunStatus } from "@pay-agent/db";

import { Badge } from "@/components/ui";

type Tone = "neutral" | "brand" | "warn" | "danger" | "gold";

const META: Record<RunStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "neutral" },
  pending_approval: { label: "Needs approval", tone: "warn" },
  approved: { label: "Approved", tone: "brand" },
  denied: { label: "Denied", tone: "danger" },
  settled: { label: "Settled", tone: "brand" },
  failed: { label: "Failed", tone: "danger" },
};

export function RunStatusBadge({ status, soft = true }: { status: RunStatus; soft?: boolean }) {
  const meta = META[status];
  return (
    <Badge tone={meta.tone} soft={soft}>
      {meta.label}
    </Badge>
  );
}
