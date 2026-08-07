/**
 * The consent-store boundary.
 *
 * Same discipline as `repository.ts`: consumers depend on these interfaces, never on a driver, so
 * the SQLite implementation can be swapped for Postgres/Supabase without a rewrite. The agent writes
 * runs, events, approvals and mandates here; the web dashboard reads them to render the approval
 * inbox and the run timeline, and writes approval decisions back. Everything is async because the
 * eventual Postgres implementation cannot be synchronous.
 */
import type {
  Approval,
  ApprovalReason,
  MandateKind,
  Run,
  RunEvent,
  RunEventKind,
  RunStatus,
  StoredMandate,
} from "./consent-types.js";

export interface CreateRunInput {
  readonly userId: string;
  readonly reference: string;
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  /** Optionally supply the run id (so the agent's reversible ids and the run id can align). */
  readonly id?: string;
}

export interface RequestApprovalInput {
  readonly runId: string;
  readonly reasons: readonly ApprovalReason[];
  readonly detail: string;
  readonly capMinor?: number | null;
}

export interface RecordMandateInput {
  readonly jti: string;
  readonly runId: string;
  readonly kind: MandateKind;
  readonly jws: string;
  readonly kid: string;
}

/** An approval joined with its run, for the inbox (which needs both to show a decision in context). */
export interface PendingApproval {
  readonly approval: Approval;
  readonly run: Run;
}

export interface ConsentStore {
  createRun(input: CreateRunInput): Promise<Run>;
  getRun(runId: string): Promise<Run | null>;
  /** Recent runs first. `limit` caps the list for a dashboard. */
  listRuns(limit?: number): Promise<Run[]>;
  setRunStatus(runId: string, status: RunStatus): Promise<void>;

  /** Append one event to the immutable trail. */
  appendEvent(
    runId: string,
    kind: RunEventKind,
    summary: string,
    data?: Record<string, unknown>,
  ): Promise<RunEvent>;
  eventsForRun(runId: string): Promise<RunEvent[]>;

  requestApproval(input: RequestApprovalInput): Promise<Approval>;
  getApproval(runId: string): Promise<Approval | null>;
  /** Approvals, optionally filtered by status (the inbox asks for `"pending"`). */
  listApprovals(status?: Approval["status"]): Promise<PendingApproval[]>;
  /**
   * Record a human's decision. Idempotent guard: deciding an already-decided approval throws, so a
   * double-submit cannot flip a denial into a grant.
   */
  decideApproval(runId: string, decision: "granted" | "denied", by: string): Promise<Approval>;

  recordMandate(input: RecordMandateInput): Promise<void>;
  mandatesForRun(runId: string): Promise<StoredMandate[]>;

  close(): Promise<void>;
}
