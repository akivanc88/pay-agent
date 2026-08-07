/** SQLite implementation of the consent store: runs, append-only audit trail, approvals, mandates. */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

import type {
  ConsentStore,
  CreateRunInput,
  PendingApproval,
  RecordMandateInput,
  RequestApprovalInput,
} from "../consent-repository.js";
import type {
  Approval,
  ApprovalReason,
  MandateKind,
  Run,
  RunEvent,
  RunEventKind,
  RunStatus,
  StoredMandate,
} from "../consent-types.js";
import { CONSENT_SCHEMA_SQL } from "./consent-schema.js";

export class ConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentError";
  }
}

interface RunRow {
  id: string;
  user_id: string;
  reference: string;
  destination_id: string;
  amount_minor: number;
  currency: string;
  description: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  seq: number;
  id: string;
  run_id: string;
  kind: string;
  summary: string;
  data: string | null;
  created_at: string;
}

interface ApprovalRow {
  run_id: string;
  status: Approval["status"];
  reasons: string;
  detail: string;
  cap_minor: number | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

interface MandateRow {
  jti: string;
  run_id: string;
  kind: MandateKind;
  jws: string;
  kid: string;
  created_at: string;
}

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    userId: row.user_id,
    reference: row.reference,
    destinationId: row.destination_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEvent(row: EventRow): RunEvent {
  return {
    seq: row.seq,
    id: row.id,
    runId: row.run_id,
    kind: row.kind as RunEventKind,
    summary: row.summary,
    data: row.data,
    createdAt: row.created_at,
  };
}

function toApproval(row: ApprovalRow): Approval {
  return {
    runId: row.run_id,
    status: row.status,
    reasons: JSON.parse(row.reasons) as ApprovalReason[],
    detail: row.detail,
    capMinor: row.cap_minor,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  };
}

class SqliteConsentStore implements ConsentStore {
  constructor(private readonly db: Database.Database) {}

  async createRun(input: CreateRunInput): Promise<Run> {
    const id = input.id ?? `run_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO runs
           (id, user_id, reference, destination_id, amount_minor, currency, description,
            status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      )
      .run(
        id,
        input.userId,
        input.reference,
        input.destinationId,
        input.amountMinor,
        input.currency,
        input.description,
        now,
        now,
      );
    return (await this.getRun(id)) as Run;
  }

  async getRun(runId: string): Promise<Run | null> {
    const row = this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | undefined;
    return row ? toRun(row) : null;
  }

  async listRuns(limit = 50): Promise<Run[]> {
    const rows = this.db
      .prepare(`SELECT * FROM runs ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(limit) as RunRow[];
    return rows.map(toRun);
  }

  async setRunStatus(runId: string, status: RunStatus): Promise<void> {
    const res = this.db
      .prepare(`UPDATE runs SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), runId);
    if (res.changes === 0) throw new ConsentError(`no such run ${runId}`);
  }

  async appendEvent(
    runId: string,
    kind: RunEventKind,
    summary: string,
    data?: Record<string, unknown>,
  ): Promise<RunEvent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO run_events (id, run_id, kind, summary, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, runId, kind, summary, data ? JSON.stringify(data) : null, now);
    const row = this.db.prepare(`SELECT * FROM run_events WHERE id = ?`).get(id) as EventRow;
    return toEvent(row);
  }

  async eventsForRun(runId: string): Promise<RunEvent[]> {
    const rows = this.db
      .prepare(`SELECT * FROM run_events WHERE run_id = ? ORDER BY seq`)
      .all(runId) as EventRow[];
    return rows.map(toEvent);
  }

  async requestApproval(input: RequestApprovalInput): Promise<Approval> {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO approvals (run_id, status, reasons, detail, cap_minor, created_at)
         VALUES (?, 'pending', ?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET
           status = 'pending', reasons = excluded.reasons, detail = excluded.detail,
           cap_minor = excluded.cap_minor, created_at = excluded.created_at,
           decided_at = NULL, decided_by = NULL`,
      )
      .run(input.runId, JSON.stringify(input.reasons), input.detail, input.capMinor ?? null, now);
    return (await this.getApproval(input.runId)) as Approval;
  }

  async getApproval(runId: string): Promise<Approval | null> {
    const row = this.db.prepare(`SELECT * FROM approvals WHERE run_id = ?`).get(runId) as
      | ApprovalRow
      | undefined;
    return row ? toApproval(row) : null;
  }

  async listApprovals(status?: Approval["status"]): Promise<PendingApproval[]> {
    const rows = (
      status
        ? this.db
            .prepare(
              `SELECT a.*, r.id AS r_id FROM approvals a
               JOIN runs r ON r.id = a.run_id
               WHERE a.status = ? ORDER BY a.created_at DESC`,
            )
            .all(status)
        : this.db
            .prepare(
              `SELECT a.*, r.id AS r_id FROM approvals a
               JOIN runs r ON r.id = a.run_id ORDER BY a.created_at DESC`,
            )
            .all()
    ) as (ApprovalRow & { r_id: string })[];

    const out: PendingApproval[] = [];
    for (const row of rows) {
      const run = await this.getRun(row.run_id);
      if (run) out.push({ approval: toApproval(row), run });
    }
    return out;
  }

  async decideApproval(runId: string, decision: "granted" | "denied", by: string): Promise<Approval> {
    const now = new Date().toISOString();
    // Guard against a double-submit flipping an already-made decision. The WHERE status='pending'
    // makes the update a no-op on an already-decided approval, and we surface that as an error.
    const res = this.db
      .prepare(
        `UPDATE approvals SET status = ?, decided_at = ?, decided_by = ?
         WHERE run_id = ? AND status = 'pending'`,
      )
      .run(decision, now, by, runId);
    if (res.changes === 0) {
      const existing = await this.getApproval(runId);
      if (!existing) throw new ConsentError(`no approval for run ${runId}`);
      throw new ConsentError(`approval for run ${runId} was already ${existing.status}`);
    }
    return (await this.getApproval(runId)) as Approval;
  }

  async recordMandate(input: RecordMandateInput): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO mandates (jti, run_id, kind, jws, kid, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.jti, input.runId, input.kind, input.jws, input.kid, new Date().toISOString());
  }

  async mandatesForRun(runId: string): Promise<StoredMandate[]> {
    const rows = this.db
      .prepare(`SELECT * FROM mandates WHERE run_id = ? ORDER BY created_at`)
      .all(runId) as MandateRow[];
    return rows.map((row) => ({
      jti: row.jti,
      runId: row.run_id,
      kind: row.kind,
      jws: row.jws,
      kid: row.kid,
      createdAt: row.created_at,
    }));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/**
 * Open a consent store. Pass `":memory:"` for tests; the schema is applied on open, so a fresh file
 * is usable immediately and an existing one is left alone.
 */
export function openConsentStore(filename: string): ConsentStore {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.exec(CONSENT_SCHEMA_SQL);
  return new SqliteConsentStore(db);
}
