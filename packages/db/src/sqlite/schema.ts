/**
 * Schema for the funding core.
 *
 * Two things here are enforced by the database rather than by application convention,
 * because both are invariants the project has to be able to *demonstrate*, and a
 * convention is only as good as the next commit:
 *
 * 1. **The ledger is append-only.** Triggers reject UPDATE and DELETE outright. A
 *    reversal is a new compensating row, not an edit, so the audit trail cannot be
 *    quietly rewritten.
 * 2. **A draw can be reversed at most once.** A unique index on `reverses_entry_id`
 *    makes double-reversal impossible even if the application logic is buggy — which
 *    matters because a declined payment can legitimately be reported more than once.
 *
 * There is deliberately **no balance column.** A card's balance is the signed sum of its
 * ledger entries, so it cannot drift out of sync with them, and a reversal restores it
 * exactly rather than approximately.
 */
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gift_cards (
  id                TEXT PRIMARY KEY,
  family            TEXT NOT NULL CHECK (family IN ('closed_loop', 'open_loop')),
  user_id           TEXT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  last4             TEXT NOT NULL,
  created_at        TEXT NOT NULL,

  -- closed_loop only
  code_lookup_hash  TEXT UNIQUE,
  pin_hash          TEXT,
  pin_salt          TEXT,

  -- open_loop only. No PAN column exists, and none may ever be added:
  -- the card number is captured by Stripe in the browser and never reaches us.
  payment_method_id TEXT UNIQUE,
  brand             TEXT,
  exp_month         INTEGER,
  exp_year          INTEGER,
  enrolled_balance  INTEGER,
  balance_stale     INTEGER NOT NULL DEFAULT 0,

  -- Each family must carry its own columns and not the other's.
  CHECK (
    (family = 'closed_loop'
      AND code_lookup_hash IS NOT NULL
      AND pin_hash IS NOT NULL
      AND pin_salt IS NOT NULL
      AND payment_method_id IS NULL)
    OR
    (family = 'open_loop'
      AND payment_method_id IS NOT NULL
      AND enrolled_balance IS NOT NULL
      AND code_lookup_hash IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_user ON gift_cards (user_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  -- Insertion order, and the only thing entries are ever ordered by.
  --
  -- Timestamps are not sufficient: several entries in one run are routinely written
  -- within the same millisecond, and ordering by a tie-broken UUID is ordering at
  -- random. An audit trail that cannot reproduce its own sequence is not an audit trail.
  seq               INTEGER PRIMARY KEY AUTOINCREMENT,
  id                TEXT NOT NULL UNIQUE,
  card_id           TEXT NOT NULL REFERENCES gift_cards (id),
  kind              TEXT NOT NULL CHECK (kind IN ('issue', 'redeem', 'reverse')),
  amount            INTEGER NOT NULL CHECK (amount >= 0),
  currency          TEXT NOT NULL,
  run_id            TEXT,
  reverses_entry_id TEXT REFERENCES ledger_entries (id),
  created_at        TEXT NOT NULL,

  -- Only a reversal may point at the entry it undoes.
  CHECK ((kind = 'reverse') = (reverses_entry_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_ledger_card ON ledger_entries (card_id);
CREATE INDEX IF NOT EXISTS idx_ledger_run  ON ledger_entries (run_id);

-- A given draw can be reversed at most once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_reverses_once
  ON ledger_entries (reverses_entry_id)
  WHERE reverses_entry_id IS NOT NULL;

-- Append-only: the audit trail is the product, so it is not editable.
CREATE TRIGGER IF NOT EXISTS ledger_entries_no_update
BEFORE UPDATE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries is append-only: UPDATE is not permitted');
END;

CREATE TRIGGER IF NOT EXISTS ledger_entries_no_delete
BEFORE DELETE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries is append-only: DELETE is not permitted');
END;
`;
