/** Verifies funding repository enrollment, balance, draw, and reversal behavior. */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, it } from "node:test";

import { minorUnits } from "../src/money.js";
import type { Store } from "../src/repository.js";
import { LedgerError, openSqliteStore } from "../src/sqlite/store.js";

const USER = "user-a";

let store: Store;

beforeEach(() => {
  store = openSqliteStore(":memory:");
});

async function issueCard(balance: number, code = `GC-${randomUUID().slice(0, 8)}`) {
  return store.cards.issueClosedLoop({
    userId: USER,
    code,
    pin: "1234",
    initialBalance: minorUnits(balance),
  });
}

describe("issuing", () => {
  it("opens with the issued balance", async () => {
    const card = await issueCard(5000);
    assert.equal(await store.ledger.balanceOf(card.id), 5000);
  });

  it("never stores the raw code or PIN", async () => {
    const card = await issueCard(5000, "GC-SECRET-1234");
    assert.notEqual(card.codeLookupHash, "GC-SECRET-1234");
    assert.equal(card.last4, "1234");
    // The PIN hash must not be the PIN, and must not be a bare digest of it either.
    assert.notEqual(card.pinHash, "1234");
    assert.ok(card.pinSalt.length > 0);
  });

  it("finds a card by its credentials", async () => {
    const card = await issueCard(1000, "GC-FIND-ME-0001");
    const found = await store.cards.findByCredentials("GC-FIND-ME-0001", "1234");
    assert.equal(found?.id, card.id);
  });

  it("normalises formatting differences in a presented code", async () => {
    await issueCard(1000, "GC-CASE-TEST-0001");
    const found = await store.cards.findByCredentials("gc case test 0001", "1234");
    assert.ok(found, "a differently formatted code should still match");
  });

  it("returns null for a wrong PIN, indistinguishably from an unknown card", async () => {
    await issueCard(1000, "GC-PIN-TEST-0001");
    assert.equal(await store.cards.findByCredentials("GC-PIN-TEST-0001", "9999"), null);
    assert.equal(await store.cards.findByCredentials("GC-DOES-NOT-EXIST", "1234"), null);
  });
});

describe("drawing", () => {
  it("draws the full amount when the balance covers it", async () => {
    const card = await issueCard(5000);
    const result = await store.ledger.draw(card.id, minorUnits(2000), randomUUID());

    assert.equal(result.drawn, 2000);
    assert.equal(result.balanceAfter, 3000);
    assert.equal(await store.ledger.balanceOf(card.id), 3000);
  });

  it("draws only what is available when the card is short", async () => {
    const card = await issueCard(1500);
    const result = await store.ledger.draw(card.id, minorUnits(4000), randomUUID());

    // Open-amount semantics: the merchant draws up to the available balance rather than
    // failing because it was asked for more.
    assert.equal(result.drawn, 1500);
    assert.equal(await store.ledger.balanceOf(card.id), 0);
  });

  it("treats a zero balance as a $0 contribution, not an error", async () => {
    const card = await issueCard(0);
    const result = await store.ledger.draw(card.id, minorUnits(2000), randomUUID());

    // UCP is explicit about this, and treating it as a failure is a common way to get
    // gift-card handling wrong: the planner must be able to move on to the next card.
    assert.equal(result.drawn, 0);
    assert.equal(result.entryId, null, "an empty draw should not write a ledger entry");
    assert.equal(await store.ledger.balanceOf(card.id), 0);
  });

  it("never lets a balance go negative across repeated draws", async () => {
    const card = await issueCard(1000);
    const run = randomUUID();
    await store.ledger.draw(card.id, minorUnits(600), run);
    await store.ledger.draw(card.id, minorUnits(600), run);
    await store.ledger.draw(card.id, minorUnits(600), run);

    assert.equal(await store.ledger.balanceOf(card.id), 0);
  });

  it("refuses to draw against an open-loop card", async () => {
    const card = await store.cards.enrollOpenLoop({
      userId: USER,
      paymentMethodId: "pm_test_123",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      enrolledBalance: minorUnits(5000),
    });

    // That balance lives at the card network, not in our ledger, and we cannot query it.
    await assert.rejects(
      () => store.ledger.draw(card.id, minorUnits(1000), randomUUID()),
      LedgerError,
    );
  });
});

describe("reversal — the invariant a decline depends on", () => {
  it("restores balances exactly after a declined run", async () => {
    const a = await issueCard(5000);
    const b = await issueCard(3000);
    const before = [await store.ledger.balanceOf(a.id), await store.ledger.balanceOf(b.id)];

    const run = randomUUID();
    await store.ledger.draw(a.id, minorUnits(5000), run);
    await store.ledger.draw(b.id, minorUnits(1200), run);

    await store.ledger.reverseRun(run);

    const after = [await store.ledger.balanceOf(a.id), await store.ledger.balanceOf(b.id)];
    assert.deepEqual(after, before, "balances must be exactly restored, not approximately");
  });

  it("is a no-op when reversing the same run twice", async () => {
    const card = await issueCard(5000);
    const run = randomUUID();
    await store.ledger.draw(card.id, minorUnits(2000), run);

    const first = await store.ledger.reverseRun(run);
    const second = await store.ledger.reverseRun(run);

    // A declined payment can legitimately be reported more than once; the second report
    // must not hand the user free money.
    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.equal(await store.ledger.balanceOf(card.id), 5000);
  });

  it("leaves other runs untouched", async () => {
    const card = await issueCard(5000);
    const declined = randomUUID();
    const kept = randomUUID();

    await store.ledger.draw(card.id, minorUnits(1000), declined);
    await store.ledger.draw(card.id, minorUnits(500), kept);

    await store.ledger.reverseRun(declined);

    assert.equal(await store.ledger.balanceOf(card.id), 4500);
  });

  it("records the reversal rather than erasing the draw", async () => {
    const card = await issueCard(5000);
    const run = randomUUID();
    await store.ledger.draw(card.id, minorUnits(2000), run);
    await store.ledger.reverseRun(run);

    const entries = await store.ledger.entriesFor(card.id);
    const kinds = entries.map((e) => e.kind);

    // The audit trail is the product: the draw still has to be visible after the undo.
    assert.deepEqual(kinds, ["issue", "redeem", "reverse"]);
    const reversal = entries.find((e) => e.kind === "reverse");
    const draw = entries.find((e) => e.kind === "redeem");
    assert.equal(reversal?.reversesEntryId, draw?.id);
  });

  it("orders entries by insertion even when written in the same millisecond", async () => {
    // Regression: ordering was `created_at, id`. Entries in one run are routinely written
    // inside the same millisecond, so the tie-break fell through to a random UUID and the
    // audit trail came back shuffled. An audit trail that cannot reproduce its own
    // sequence is not an audit trail.
    const card = await issueCard(10_000);
    const run = randomUUID();
    for (let i = 0; i < 12; i++) {
      await store.ledger.draw(card.id, minorUnits(100), run);
    }

    const entries = await store.ledger.entriesFor(card.id);
    const seqs = entries.map((e) => e.seq);

    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), "entries must come back in order");
    assert.equal(entries[0]!.kind, "issue", "the issue must always come first");
    assert.equal(new Set(seqs).size, seqs.length, "sequence numbers must be unique");
  });
});

describe("append-only enforcement", () => {
  // These reach past the repository deliberately. The guarantee has to hold against a
  // caller that bypasses the application layer entirely — that is the whole reason it
  // lives in database triggers rather than in our code.

  it("rejects UPDATE on the ledger at the database level", async () => {
    const card = await issueCard(5000);
    const [entry] = await store.ledger.entriesFor(card.id);

    assert.throws(
      () => rawDb(store).prepare(`UPDATE ledger_entries SET amount = 1 WHERE id = ?`).run(entry!.id),
      /append-only/,
    );
  });

  it("rejects DELETE on the ledger at the database level", async () => {
    const card = await issueCard(5000);
    const [entry] = await store.ledger.entriesFor(card.id);

    assert.throws(
      () => rawDb(store).prepare(`DELETE FROM ledger_entries WHERE id = ?`).run(entry!.id),
      /append-only/,
    );
  });

  it("refuses a second reversal of the same draw even via raw SQL", async () => {
    const card = await issueCard(5000);
    const run = randomUUID();
    const draw = await store.ledger.draw(card.id, minorUnits(2000), run);
    await store.ledger.reverseRun(run);

    // The unique index is what makes double-reversal impossible regardless of what the
    // application logic does.
    assert.throws(
      () =>
        rawDb(store)
          .prepare(
            `INSERT INTO ledger_entries
               (id, card_id, kind, amount, currency, run_id, reverses_entry_id, created_at)
             VALUES (?, ?, 'reverse', 2000, 'USD', ?, ?, ?)`,
          )
          .run(randomUUID(), card.id, run, draw.entryId, new Date().toISOString()),
      /UNIQUE/i,
    );
  });
});

/**
 * The store keeps its connection private; tests borrow it to prove the database-level
 * guarantees. Production code has no route to this and should never gain one.
 */
function rawDb(s: Store): {
  prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
} {
  return (s as unknown as { db: { prepare: (sql: string) => { run: (...a: unknown[]) => unknown } } })
    .db;
}
