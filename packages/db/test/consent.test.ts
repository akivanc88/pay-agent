/** Verifies the consent store: runs, the append-only trail, approvals, decisions, and mandates. */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConsentStore } from "../src/consent-repository.js";
import { openConsentStore, ConsentError } from "../src/index.js";

function freshStore() {
  return openConsentStore(":memory:");
}

/**
 * Reach past the repository to the underlying connection, the same way the ledger tests do — without
 * importing the driver, which the storage-boundary invariant forbids outside `src/sqlite`. The
 * append-only guarantee has to hold against a caller that bypasses the application layer entirely.
 */
function rawDb(s: ConsentStore): { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } {
  return (s as unknown as { db: { prepare: (sql: string) => { run: (...a: unknown[]) => unknown } } }).db;
}

async function seedRun(store: ReturnType<typeof openConsentStore>, overrides: Record<string, unknown> = {}) {
  return store.createRun({
    userId: "demo-user",
    reference: "acct_demo",
    destinationId: "streamco",
    amountMinor: 4599,
    currency: "CAD",
    description: "StreamCo account acct_demo",
    ...overrides,
  });
}

test("a run is created open and can be listed", async () => {
  const store = freshStore();
  const run = await seedRun(store);
  assert.equal(run.status, "open");
  const listed = await store.listRuns();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.id, run.id);
  await store.close();
});

test("events append in seq order with structured data", async () => {
  const store = freshStore();
  const run = await seedRun(store);
  await store.appendEvent(run.id, "discovered", "found $45.99");
  await store.appendEvent(run.id, "policy_blocked", "over the cap", { capMinor: 2000 });
  const events = await store.eventsForRun(run.id);
  assert.deepEqual(events.map((e) => e.kind), ["discovered", "policy_blocked"]);
  assert.ok(events[0]!.seq < events[1]!.seq);
  assert.equal(JSON.parse(events[1]!.data!).capMinor, 2000);
  await store.close();
});

test("append-only triggers reject UPDATE and DELETE on run_events, against raw SQL", async () => {
  const store = freshStore();
  const run = await seedRun(store);
  const ev = await store.appendEvent(run.id, "info", "immutable");

  assert.throws(
    () => rawDb(store).prepare(`UPDATE run_events SET summary = 'tampered' WHERE id = ?`).run(ev.id),
    /append-only/,
  );
  assert.throws(() => rawDb(store).prepare(`DELETE FROM run_events WHERE id = ?`).run(ev.id), /append-only/);

  // The mandates table carries the same guarantee.
  rawDb(store)
    .prepare(
      `INSERT INTO mandates (jti, run_id, kind, jws, kid, created_at)
       VALUES ('j', ?, 'CheckoutMandate', 'a.b.c', 'mk', '2026-01-01')`,
    )
    .run(run.id);
  assert.throws(() => rawDb(store).prepare(`DELETE FROM mandates WHERE jti = 'j'`).run(), /append-only/);
  await store.close();
});

test("an approval can be requested, listed pending, and granted once", async () => {
  const store = freshStore();
  const run = await seedRun(store);
  await store.setRunStatus(run.id, "pending_approval");
  const approval = await store.requestApproval({
    runId: run.id,
    reasons: ["over_cap"],
    detail: "$45.99 exceeds the $20.00 cap",
    capMinor: 2000,
  });
  assert.equal(approval.status, "pending");
  assert.deepEqual([...approval.reasons], ["over_cap"]);

  const pending = await store.listApprovals("pending");
  assert.equal(pending.length, 1);
  assert.equal(pending[0]!.run.id, run.id);

  const granted = await store.decideApproval(run.id, "granted", "demo-user");
  assert.equal(granted.status, "granted");
  assert.equal(granted.decidedBy, "demo-user");

  // Deciding again must not flip the decision.
  await assert.rejects(() => store.decideApproval(run.id, "denied", "attacker"), ConsentError);
  assert.equal((await store.listApprovals("pending")).length, 0);
  await store.close();
});

test("mandates are stored and returned per run", async () => {
  const store = freshStore();
  const run = await seedRun(store);
  await store.recordMandate({ jti: "j1", runId: run.id, kind: "CheckoutMandate", jws: "a.b.c", kid: "mk_1" });
  await store.recordMandate({ jti: "j2", runId: run.id, kind: "PaymentMandate", jws: "d.e.f", kid: "mk_1" });
  const mandates = await store.mandatesForRun(run.id);
  assert.deepEqual(mandates.map((m) => m.kind), ["CheckoutMandate", "PaymentMandate"]);
  await store.close();
});

test("cumulative sum totals only settled runs gated by a given IntentMandate jti", async () => {
  const store = freshStore();
  // Two runs gated by intent "int_A", one settled and one not; a third gated by "int_B".
  const r1 = await seedRun(store, { amountMinor: 2000 });
  const r2 = await seedRun(store, { amountMinor: 2500 });
  const r3 = await seedRun(store, { amountMinor: 900 });
  await store.setRunIntentJti(r1.id, "int_A");
  await store.setRunIntentJti(r2.id, "int_A");
  await store.setRunIntentJti(r3.id, "int_B");

  // Nothing settled yet → zero under either mandate.
  assert.equal(await store.sumSettledAmountForMandate("int_A"), 0);

  await store.setRunStatus(r1.id, "settled");
  assert.equal(await store.sumSettledAmountForMandate("int_A"), 2000, "only r1 (settled) counts");
  await store.setRunStatus(r2.id, "settled");
  assert.equal(await store.sumSettledAmountForMandate("int_A"), 4500, "r1 + r2 both settled under int_A");
  await store.setRunStatus(r3.id, "settled");
  assert.equal(await store.sumSettledAmountForMandate("int_A"), 4500, "r3 is gated by int_B, not int_A");
  assert.equal(await store.sumSettledAmountForMandate("int_B"), 900);
  await store.close();
});

test("the same IntentMandate can gate several runs, and each run's timeline still shows it", async () => {
  const store = freshStore();
  const r1 = await seedRun(store);
  const r2 = await seedRun(store);
  // The same signed IntentMandate gates both runs — recorded once per run, second is a no-op.
  await store.recordMandate({ jti: "intent_shared", runId: r1.id, kind: "IntentMandate", jws: "i.j.k", kid: "mk_1" });
  await store.recordMandate({ jti: "intent_shared", runId: r2.id, kind: "IntentMandate", jws: "i.j.k", kid: "mk_1" });
  await store.setRunIntentJti(r1.id, "intent_shared");
  await store.setRunIntentJti(r2.id, "intent_shared");

  // Even though the row is stored under r1, r2's timeline includes the gating IntentMandate.
  const m2 = await store.mandatesForRun(r2.id);
  assert.deepEqual(m2.map((m) => m.kind), ["IntentMandate"]);
  assert.equal(m2[0]!.jti, "intent_shared");
  await store.close();
});
