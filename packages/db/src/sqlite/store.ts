/** Implements the funding repository and atomic ledger transactions on SQLite. */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

import { hashCode, hashPin, last4 as codeLast4, verifyPin } from "../credentials.js";
import { DEFAULT_CURRENCY, minorUnits, type MinorUnits, ZERO } from "../money.js";
import type {
  EnrollOpenLoopCardInput,
  GiftCardRepository,
  IssueClosedLoopCardInput,
  LedgerRepository,
  Store,
} from "../repository.js";
import type {
  ClosedLoopCard,
  DrawResult,
  GiftCard,
  LedgerEntry,
  OpenLoopCard,
} from "../types.js";
import { SCHEMA_SQL } from "./schema.js";

/**
 * SQLite implementation of the storage boundary.
 *
 * This is the **only** file in the project permitted to import `better-sqlite3`. Everything
 * else depends on the interfaces in `../repository.ts`, so replacing this with a Postgres
 * or Supabase implementation is an additive change rather than a rewrite.
 */

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

interface CardRow {
  id: string;
  family: "closed_loop" | "open_loop";
  user_id: string;
  currency: string;
  last4: string;
  created_at: string;
  code_lookup_hash: string | null;
  pin_hash: string | null;
  pin_salt: string | null;
  payment_method_id: string | null;
  brand: string | null;
  exp_month: number | null;
  exp_year: number | null;
  enrolled_balance: number | null;
  balance_stale: number;
}

interface EntryRow {
  seq: number;
  id: string;
  card_id: string;
  kind: "issue" | "redeem" | "reverse";
  amount: number;
  currency: string;
  run_id: string | null;
  reverses_entry_id: string | null;
  created_at: string;
}

function toCard(row: CardRow): GiftCard {
  if (row.family === "closed_loop") {
    return {
      id: row.id,
      family: "closed_loop",
      userId: row.user_id,
      codeLookupHash: row.code_lookup_hash!,
      pinHash: row.pin_hash!,
      pinSalt: row.pin_salt!,
      last4: row.last4,
      currency: row.currency,
      createdAt: row.created_at,
    } satisfies ClosedLoopCard;
  }
  return {
    id: row.id,
    family: "open_loop",
    userId: row.user_id,
    paymentMethodId: row.payment_method_id!,
    brand: row.brand!,
    last4: row.last4,
    expMonth: row.exp_month!,
    expYear: row.exp_year!,
    enrolledBalance: minorUnits(row.enrolled_balance!),
    balanceVerified: false,
    balanceStale: row.balance_stale === 1,
    currency: row.currency,
    createdAt: row.created_at,
  } satisfies OpenLoopCard;
}

function toEntry(row: EntryRow): LedgerEntry {
  return {
    seq: row.seq,
    id: row.id,
    cardId: row.card_id,
    kind: row.kind,
    amount: minorUnits(row.amount),
    currency: row.currency,
    runId: row.run_id,
    reversesEntryId: row.reverses_entry_id,
    createdAt: row.created_at,
  };
}

class SqliteStore implements Store {
  readonly cards: GiftCardRepository;
  readonly ledger: LedgerRepository;

  constructor(private readonly db: Database.Database) {
    this.cards = new SqliteGiftCardRepository(db);
    this.ledger = new SqliteLedgerRepository(db);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

class SqliteGiftCardRepository implements GiftCardRepository {
  constructor(private readonly db: Database.Database) {}

  async issueClosedLoop(input: IssueClosedLoopCardInput): Promise<ClosedLoopCard> {
    const pin = await hashPin(input.pin);
    const id = randomUUID();
    const now = new Date().toISOString();
    const currency = input.currency ?? DEFAULT_CURRENCY;

    // The card and its opening balance land together: a card that exists but has no
    // issue entry would read as a zero balance, which is a different thing entirely.
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO gift_cards
             (id, family, user_id, currency, last4, created_at,
              code_lookup_hash, pin_hash, pin_salt)
           VALUES (?, 'closed_loop', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.userId,
          currency,
          codeLast4(input.code),
          now,
          hashCode(input.code),
          pin.hash,
          pin.salt,
        );

      this.db
        .prepare(
          `INSERT INTO ledger_entries
             (id, card_id, kind, amount, currency, run_id, reverses_entry_id, created_at)
           VALUES (?, ?, 'issue', ?, ?, NULL, NULL, ?)`,
        )
        .run(randomUUID(), id, input.initialBalance, currency, now);
    })();

    return (await this.findById(id)) as ClosedLoopCard;
  }

  async enrollOpenLoop(input: EnrollOpenLoopCardInput): Promise<OpenLoopCard> {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO gift_cards
           (id, family, user_id, currency, last4, created_at,
            payment_method_id, brand, exp_month, exp_year, enrolled_balance)
         VALUES (?, 'open_loop', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.userId,
        input.currency ?? DEFAULT_CURRENCY,
        input.last4,
        now,
        input.paymentMethodId,
        input.brand,
        input.expMonth,
        input.expYear,
        input.enrolledBalance,
      );

    return (await this.findById(id)) as OpenLoopCard;
  }

  async findById(cardId: string): Promise<GiftCard | null> {
    const row = this.db
      .prepare(`SELECT * FROM gift_cards WHERE id = ?`)
      .get(cardId) as CardRow | undefined;
    return row ? toCard(row) : null;
  }

  async findByCredentials(code: string, pin: string): Promise<ClosedLoopCard | null> {
    const row = this.db
      .prepare(`SELECT * FROM gift_cards WHERE code_lookup_hash = ? AND family = 'closed_loop'`)
      .get(hashCode(code)) as CardRow | undefined;

    // Return null for both "no such card" and "wrong PIN" so a caller cannot use this
    // to enumerate which codes exist.
    if (!row) return null;
    if (!(await verifyPin(pin, { hash: row.pin_hash!, salt: row.pin_salt! }))) return null;

    return toCard(row) as ClosedLoopCard;
  }

  async listForUser(userId: string): Promise<GiftCard[]> {
    const rows = this.db
      .prepare(`SELECT * FROM gift_cards WHERE user_id = ? ORDER BY created_at`)
      .all(userId) as CardRow[];
    return rows.map(toCard);
  }

  async markBalanceStale(cardId: string): Promise<void> {
    this.db.prepare(`UPDATE gift_cards SET balance_stale = 1 WHERE id = ?`).run(cardId);
  }
}

class SqliteLedgerRepository implements LedgerRepository {
  constructor(private readonly db: Database.Database) {}

  /** Balance is always derived from entries — there is no stored balance to trust. */
  private balanceSync(cardId: string): MinorUnits {
    const row = this.db
      .prepare(
        `SELECT COALESCE(
           SUM(CASE kind WHEN 'redeem' THEN -amount ELSE amount END), 0
         ) AS balance
         FROM ledger_entries WHERE card_id = ?`,
      )
      .get(cardId) as { balance: number };
    return minorUnits(row.balance);
  }

  private requireDrawable(cardId: string): void {
    const row = this.db
      .prepare(`SELECT family FROM gift_cards WHERE id = ?`)
      .get(cardId) as { family: string } | undefined;
    if (!row) throw new LedgerError(`No such card: ${cardId}`);
    if (row.family !== "closed_loop") {
      // Drawing against an open-loop card from our ledger would be a category error:
      // that balance lives at the card network, not here, and we cannot query it.
      throw new LedgerError(
        `Card ${cardId} is open_loop and cannot be drawn from this ledger. ` +
          `Charge it over card rails; use enrolledBalance only as an unverified hint.`,
      );
    }
  }

  async balanceOf(cardId: string): Promise<MinorUnits> {
    this.requireDrawable(cardId);
    return this.balanceSync(cardId);
  }

  async entriesFor(cardId: string): Promise<LedgerEntry[]> {
    const rows = this.db
      .prepare(`SELECT * FROM ledger_entries WHERE card_id = ? ORDER BY seq`)
      .all(cardId) as EntryRow[];
    return rows.map(toEntry);
  }

  async entriesForRun(runId: string): Promise<LedgerEntry[]> {
    const rows = this.db
      .prepare(`SELECT * FROM ledger_entries WHERE run_id = ? ORDER BY seq`)
      .all(runId) as EntryRow[];
    return rows.map(toEntry);
  }

  async draw(cardId: string, requested: MinorUnits, runId: string): Promise<DrawResult> {
    this.requireDrawable(cardId);

    const currency = (
      this.db.prepare(`SELECT currency FROM gift_cards WHERE id = ?`).get(cardId) as {
        currency: string;
      }
    ).currency;

    // Read-then-write must be atomic, or two concurrent draws could each observe the
    // same balance and jointly overdraw it.
    const result = this.db.transaction((): DrawResult => {
      const balance = this.balanceSync(cardId);
      const drawn = minorUnits(Math.min(requested, balance));

      // UCP is explicit: a zero balance is a valid $0 contribution, not a failure. We
      // write no entry for it — an empty draw is not an event worth recording — but we
      // still return successfully so the planner moves on to the next instrument.
      if (drawn === 0) {
        return { cardId, drawn: ZERO, entryId: null, balanceAfter: balance };
      }

      const entryId = randomUUID();
      this.db
        .prepare(
          `INSERT INTO ledger_entries
             (id, card_id, kind, amount, currency, run_id, reverses_entry_id, created_at)
           VALUES (?, ?, 'redeem', ?, ?, ?, NULL, ?)`,
        )
        .run(entryId, cardId, drawn, currency, runId, new Date().toISOString());

      return {
        cardId,
        drawn,
        entryId,
        balanceAfter: minorUnits(balance - drawn),
      };
    })();

    return result;
  }

  async reverseRun(runId: string): Promise<LedgerEntry[]> {
    const created = this.db.transaction((): string[] => {
      // Only draws that have not already been reversed. Reversing twice must be a no-op,
      // because a declined payment can be reported more than once.
      const draws = this.db
        .prepare(
          `SELECT e.* FROM ledger_entries e
           WHERE e.run_id = ?
             AND e.kind = 'redeem'
             AND NOT EXISTS (
               SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id
             )
           ORDER BY e.seq`,
        )
        .all(runId) as EntryRow[];

      const ids: string[] = [];
      for (const draw of draws) {
        const id = randomUUID();
        this.db
          .prepare(
            `INSERT INTO ledger_entries
               (id, card_id, kind, amount, currency, run_id, reverses_entry_id, created_at)
             VALUES (?, ?, 'reverse', ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            draw.card_id,
            draw.amount,
            draw.currency,
            runId,
            draw.id,
            new Date().toISOString(),
          );
        ids.push(id);
      }
      return ids;
    })();

    if (created.length === 0) return [];
    const placeholders = created.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT * FROM ledger_entries WHERE id IN (${placeholders})`)
      .all(...created) as EntryRow[];
    return rows.map(toEntry);
  }
}

/**
 * Open a store.
 *
 * Pass `":memory:"` for tests. The schema is applied on open, so a fresh file is usable
 * immediately and an existing one is left alone.
 */
export function openSqliteStore(filename: string): Store {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return new SqliteStore(db);
}
