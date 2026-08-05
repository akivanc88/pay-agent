/** Defines the persistence boundary used by funding cards and append-only ledger operations. */

import type { MinorUnits } from "./money.js";
import type {
  ClosedLoopCard,
  DrawResult,
  GiftCard,
  LedgerEntry,
  OpenLoopCard,
} from "./types.js";

/**
 * The storage boundary.
 *
 * **Nothing outside this package may import `better-sqlite3`.** The plan commits to
 * "SQLite now, Supabase later", and that migration is only cheap if the rest of the
 * codebase talks to these interfaces instead of to a driver. Getting this wrong turns a
 * migration into a rewrite, which is why the boundary is declared before any consumer
 * exists rather than extracted afterwards.
 *
 * Everything here is async even though the SQLite implementation is synchronous. That is
 * deliberate: a Postgres implementation cannot be synchronous, so the interface is shaped
 * for the destination rather than for today's driver.
 */

export interface IssueClosedLoopCardInput {
  readonly userId: string;
  /** Raw card code. Hashed before storage; never persisted in the clear. */
  readonly code: string;
  /** Raw PIN. Hashed before storage; never persisted in the clear. */
  readonly pin: string;
  /** Opening balance, written to the ledger as an `issue` entry. */
  readonly initialBalance: MinorUnits;
  readonly currency?: string;
}

export interface EnrollOpenLoopCardInput {
  readonly userId: string;
  /** Stripe PaymentMethod id. The PAN never reaches us. */
  readonly paymentMethodId: string;
  readonly brand: string;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
  /** What the user says is on the card. Unverified by construction. */
  readonly enrolledBalance: MinorUnits;
  readonly currency?: string;
}

export interface GiftCardRepository {
  issueClosedLoop(input: IssueClosedLoopCardInput): Promise<ClosedLoopCard>;
  enrollOpenLoop(input: EnrollOpenLoopCardInput): Promise<OpenLoopCard>;

  findById(cardId: string): Promise<GiftCard | null>;

  /**
   * Find a closed-loop card by a presented code, verifying the PIN.
   *
   * Returns null both when no card matches and when the PIN is wrong — callers must not
   * be able to distinguish "no such card" from "wrong PIN".
   */
  findByCredentials(code: string, pin: string): Promise<ClosedLoopCard | null>;

  listForUser(userId: string): Promise<GiftCard[]>;

  /** Mark an enrolled balance as stale after a decline proved it wrong. */
  markBalanceStale(cardId: string): Promise<void>;
}

export interface LedgerRepository {
  /**
   * Current balance, derived by summing the card's entries.
   *
   * There is no stored balance column to drift out of sync with the entries.
   */
  balanceOf(cardId: string): Promise<MinorUnits>;

  entriesFor(cardId: string): Promise<LedgerEntry[]>;

  entriesForRun(runId: string): Promise<LedgerEntry[]>;

  /**
   * Draw up to `requested` from a card, per UCP's open-amount semantics.
   *
   * Draws `min(requested, balance)`. **A zero balance yields a zero draw, which is a
   * valid $0 contribution and not an error** — UCP is explicit about this, and treating
   * it as a failure is a common way to get gift-card handling wrong.
   */
  draw(cardId: string, requested: MinorUnits, runId: string): Promise<DrawResult>;

  /**
   * Reverse every draw belonging to a run, restoring balances exactly.
   *
   * Appends compensating `reverse` entries rather than deleting anything — the ledger is
   * append-only, so a reversal is itself auditable. Reversing a run twice must be a
   * no-op, because a declined payment can be reported more than once.
   */
  reverseRun(runId: string): Promise<LedgerEntry[]>;
}

/** Both repositories over one connection, so a caller needs a single handle. */
export interface Store {
  readonly cards: GiftCardRepository;
  readonly ledger: LedgerRepository;
  close(): Promise<void>;
}
