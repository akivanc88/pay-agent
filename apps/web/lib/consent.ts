/**
 * The web app's read/decide door onto the agent's consent store.
 *
 * The agent writes runs, the append-only audit trail, approvals and signed mandates through
 * `@pay-agent/db`; the dashboard reads the same SQLite file to render the approval inbox and the run
 * timeline, and writes a human's approve/deny decision back. This is the agent's *own* audit
 * persistence — distinct from the merchant's funding database, which the agent only ever reaches over
 * HTTP. Both processes agree on one file: `CONSENT_DB_PATH`, defaulting to `apps/web/.data/consent.db`.
 *
 * Each helper opens and closes its own handle. That is deliberately unclever: a per-call handle can't
 * go stale across Next's dev hot-reloads, and for a single-user demo the cost is irrelevant. If this
 * ever needs to scale, the repository interface is the seam a pooled Postgres implementation slots
 * into — nothing here reaches for the driver directly.
 */
import "server-only";
import { join } from "node:path";

import {
  openConsentStore,
  type Approval,
  type ConsentStore,
  type PendingApproval,
  type Run,
  type RunEvent,
  type StoredMandate,
} from "@pay-agent/db";

export type { Approval, PendingApproval, Run, RunEvent, StoredMandate } from "@pay-agent/db";

export function consentDbPath(): string {
  return process.env.CONSENT_DB_PATH ?? join(process.cwd(), ".data", "consent.db");
}

async function withConsent<T>(fn: (store: ConsentStore) => Promise<T>): Promise<T> {
  const store = openConsentStore(consentDbPath());
  try {
    return await fn(store);
  } finally {
    await store.close();
  }
}

export async function listRuns(limit = 50): Promise<Run[]> {
  return withConsent((s) => s.listRuns(limit));
}

export async function getRun(runId: string): Promise<Run | null> {
  return withConsent((s) => s.getRun(runId));
}

export async function eventsForRun(runId: string): Promise<RunEvent[]> {
  return withConsent((s) => s.eventsForRun(runId));
}

export async function mandatesForRun(runId: string): Promise<StoredMandate[]> {
  return withConsent((s) => s.mandatesForRun(runId));
}

export async function approvalForRun(runId: string): Promise<Approval | null> {
  return withConsent((s) => s.getApproval(runId));
}

export async function pendingApprovals(): Promise<PendingApproval[]> {
  return withConsent((s) => s.listApprovals("pending"));
}

export async function allApprovals(): Promise<PendingApproval[]> {
  return withConsent((s) => s.listApprovals());
}

/** Everything one run produced, assembled for the timeline surface. */
export interface RunDetail {
  readonly run: Run;
  readonly events: RunEvent[];
  readonly mandates: StoredMandate[];
  readonly approval: Approval | null;
}

export async function runDetail(runId: string): Promise<RunDetail | null> {
  return withConsent(async (s) => {
    const run = await s.getRun(runId);
    if (!run) return null;
    const [events, mandates, approval] = await Promise.all([
      s.eventsForRun(runId),
      s.mandatesForRun(runId),
      s.getApproval(runId),
    ]);
    return { run, events, mandates, approval };
  });
}

/** Record a human's decision on an approval. Throws if it was already decided. */
export async function decideApproval(
  runId: string,
  decision: "granted" | "denied",
  by: string,
): Promise<Approval> {
  return withConsent(async (s) => {
    const approval = await s.decideApproval(runId, decision, by);
    // Reflect the decision on the run so the inbox and timeline agree without re-running the agent.
    // A grant leaves the run "approved" (the agent resumes it); a denial ends it.
    await s.setRunStatus(runId, decision === "granted" ? "approved" : "denied");
    await s.appendEvent(
      runId,
      decision === "granted" ? "approval_granted" : "approval_denied",
      decision === "granted" ? `Approved by ${by}.` : `Denied by ${by}.`,
    );
    return approval;
  });
}
