/**
 * Schema for the consent layer: runs, an append-only audit trail, approvals, and stored mandates.
 *
 * The trail (`run_events`) and the issued `mandates` are append-only, enforced by triggers exactly
 * like the funding ledger — the audit trail is evidence, and evidence you can quietly edit is not
 * evidence. `runs` and `approvals` carry mutable current-state (a status, a decision), but every
 * transition is *also* written to `run_events`, so the immutable trail remains the source of truth
 * even though the summary rows move.
 */
export const CONSENT_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  reference      TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  amount_minor   INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency       TEXT NOT NULL,
  description    TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN
                   ('open','pending_approval','approved','denied','settled','failed')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs (created_at);

CREATE TABLE IF NOT EXISTS run_events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT NOT NULL UNIQUE,
  run_id     TEXT NOT NULL REFERENCES runs (id),
  kind       TEXT NOT NULL,
  summary    TEXT NOT NULL,
  data       TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events (run_id);

CREATE TRIGGER IF NOT EXISTS run_events_no_update
BEFORE UPDATE ON run_events
BEGIN
  SELECT RAISE(ABORT, 'run_events is append-only: UPDATE is not permitted');
END;

CREATE TRIGGER IF NOT EXISTS run_events_no_delete
BEFORE DELETE ON run_events
BEGIN
  SELECT RAISE(ABORT, 'run_events is append-only: DELETE is not permitted');
END;

CREATE TABLE IF NOT EXISTS approvals (
  run_id     TEXT PRIMARY KEY REFERENCES runs (id),
  status     TEXT NOT NULL CHECK (status IN ('pending','granted','denied')),
  reasons    TEXT NOT NULL,           -- JSON array of reason codes
  detail     TEXT NOT NULL,
  cap_minor  INTEGER,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals (status);

CREATE TABLE IF NOT EXISTS mandates (
  jti        TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs (id),
  kind       TEXT NOT NULL CHECK (kind IN ('IntentMandate','CheckoutMandate','PaymentMandate')),
  jws        TEXT NOT NULL,
  kid        TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mandates_run ON mandates (run_id);

CREATE TRIGGER IF NOT EXISTS mandates_no_update
BEFORE UPDATE ON mandates
BEGIN
  SELECT RAISE(ABORT, 'mandates is append-only: UPDATE is not permitted');
END;

CREATE TRIGGER IF NOT EXISTS mandates_no_delete
BEFORE DELETE ON mandates
BEGIN
  SELECT RAISE(ABORT, 'mandates is append-only: DELETE is not permitted');
END;
`;
