/**
 * Print the funding ledger for a user.
 *
 * The audit trail is the interesting part of this project, so it needs to be visible
 * without a database client. Used in demos to show balances before and after a payment,
 * and to show that a reversal *adds* a compensating entry rather than erasing the draw.
 *
 *   pnpm --filter @pay-agent/store show-ledger
 */

import { format } from "@pay-agent/db";

import { getFundingStore } from "../src/payments/gift-card";

const userId = process.argv[2] ?? process.env["DEMO_USER_ID"] ?? "demo-user";
const store = getFundingStore();
const cards = await store.cards.listForUser(userId);

if (cards.length === 0) {
  console.log(`No cards for user "${userId}". Issue one with: pnpm issue-card <code> <pin> <dollars>`);
} else {
  for (const card of cards) {
    if (card.family === "open_loop") {
      console.log(
        `\n  ${card.brand} ••••${card.last4}  (open-loop, ${card.paymentMethodId})\n` +
          `    enrolled balance ${format(card.enrolledBalance)} — UNVERIFIED` +
          `${card.balanceStale ? ", known stale" : ""}`,
      );
      continue;
    }

    console.log(`\n  gift card ••••${card.last4}   balance ${format(await store.ledger.balanceOf(card.id))}`);
    console.log("    seq  kind     amount      run");
    console.log("    ---  -------  ----------  --------");
    for (const e of await store.ledger.entriesFor(card.id)) {
      const sign = e.kind === "redeem" ? "-" : "+";
      console.log(
        `    ${String(e.seq).padStart(3)}  ${e.kind.padEnd(7)}  ` +
          `${(sign + format(e.amount)).padStart(10)}  ${e.runId?.slice(4, 12) ?? "—"}`,
      );
    }
  }
  console.log();
}

await store.close();
