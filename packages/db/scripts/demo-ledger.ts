/**
 * M1 demo: issue a card, redeem it, watch the ledger — then watch a decline give the
 * balance back exactly.
 *
 * Run with: pnpm --filter @pay-agent/db demo
 *
 * This is the funding core end to end, with no HTTP and no Stripe involved. Everything it
 * prints is derived from the append-only ledger; there is no stored balance anywhere.
 */

import { randomUUID } from "node:crypto";

import { format, minorUnits } from "../src/money.js";
import { openSqliteStore } from "../src/sqlite/store.js";
import type { LedgerEntry } from "../src/types.js";

const store = openSqliteStore(":memory:");
const USER = "demo-user";

function printLedger(entries: LedgerEntry[]): void {
  console.log("    seq  kind     amount      run");
  console.log("    ---  -------  ----------  --------");
  for (const e of entries) {
    const sign = e.kind === "redeem" ? "-" : "+";
    console.log(
      `    ${String(e.seq).padStart(3)}  ${e.kind.padEnd(7)}  ` +
        `${(sign + format(e.amount)).padStart(10)}  ${e.runId?.slice(0, 8) ?? "—"}`,
    );
  }
}

async function main(): Promise<void> {
  console.log("\n=== 1. Merchant issues three gift cards ===\n");
  const big = await store.cards.issueClosedLoop({
    userId: USER,
    code: "GC-DEMO-AAAA-1111",
    pin: "1234",
    initialBalance: minorUnits(2500), // $25.00
  });
  const small = await store.cards.issueClosedLoop({
    userId: USER,
    code: "GC-DEMO-BBBB-2222",
    pin: "5678",
    initialBalance: minorUnits(700), // $7.00
  });
  const empty = await store.cards.issueClosedLoop({
    userId: USER,
    code: "GC-DEMO-CCCC-3333",
    pin: "9999",
    initialBalance: minorUnits(0), // deliberately empty
  });

  for (const c of [big, small, empty]) {
    console.log(
      `  card ••••${c.last4}  ${format(await store.ledger.balanceOf(c.id))}` +
        `   (stored: code hash ${c.codeLookupHash.slice(0, 12)}…, never the code itself)`,
    );
  }

  console.log("\n=== 2. Agent pays $40.00 — the gift cards cannot cover it alone ===\n");
  const run = randomUUID();
  const due = minorUnits(4000);
  let remaining: number = due;

  // Draw in priority order. Per UCP the cards are submitted open-amount: we ask for what
  // is still owed and take whatever the card can give.
  for (const card of [empty, big, small]) {
    const result = await store.ledger.draw(card.id, minorUnits(remaining), run);
    remaining -= result.drawn;
    const note =
      result.drawn === 0 ? "  ← $0 contribution, valid per UCP, not an error" : "";
    console.log(
      `  ••••${card.last4}  drew ${format(result.drawn).padStart(7)}` +
        `   remaining ${format(minorUnits(remaining)).padStart(7)}${note}`,
    );
  }

  console.log(
    `\n  Gift cards covered ${format(minorUnits(due - remaining))}; ` +
      `${format(minorUnits(remaining))} would go to the card rail.`,
  );

  console.log("\n=== 3. The destination declines ===\n");
  console.log("  Reversing every redemption in this run…\n");
  const before = [
    await store.ledger.balanceOf(big.id),
    await store.ledger.balanceOf(small.id),
  ];
  await store.ledger.reverseRun(run);
  const after = [
    await store.ledger.balanceOf(big.id),
    await store.ledger.balanceOf(small.id),
  ];

  console.log(`  ••••${big.last4}   ${format(before[0]!)} → ${format(after[0]!)}`);
  console.log(`  ••••${small.last4}   ${format(before[1]!)} → ${format(after[1]!)}`);

  const restored =
    after[0] === 2500 && after[1] === 700 ? "EXACTLY restored" : "MISMATCH — bug";
  console.log(`\n  Balances ${restored}.`);

  console.log("\n=== 4. The ledger — the draw is still visible after the undo ===\n");
  console.log(`  Card ••••${big.last4}:`);
  printLedger(await store.ledger.entriesFor(big.id));

  console.log("\n  Reversing the same run again (a decline can be reported twice):");
  const second = await store.ledger.reverseRun(run);
  console.log(
    `    ${second.length} new entries — a no-op, so nobody gets free money.\n`,
  );

  await store.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
