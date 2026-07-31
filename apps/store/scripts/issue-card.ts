/**
 * Issue a closed-loop gift card into the merchant's funding ledger.
 *
 * The first slice of the merchant admin surface: enough to run and demo the funding core
 * without a UI. Balances are given in dollars for convenience and converted to minor units
 * here — the ledger itself only ever sees integers.
 *
 *   pnpm --filter @pay-agent/store issue-card GC-DEMO-0001 1234 25.00
 */

import { format, minorUnits } from "@pay-agent/db";

import { getFundingStore } from "../src/payments/gift-card";

const [code, pin, dollars] = process.argv.slice(2);

if (!code || !pin || !dollars) {
  console.error("usage: issue-card <code> <pin> <balance-in-dollars>");
  process.exit(1);
}

const cents = Math.round(Number(dollars) * 100);
if (!Number.isFinite(cents) || cents < 0) {
  console.error(`invalid balance: ${dollars}`);
  process.exit(1);
}

const store = getFundingStore();

const card = await store.cards.issueClosedLoop({
  userId: process.env["DEMO_USER_ID"] ?? "demo-user",
  code,
  pin,
  initialBalance: minorUnits(cents),
});

console.log(
  `issued ••••${card.last4}  ${format(await store.ledger.balanceOf(card.id))}  ` +
    `(card ${card.id})`,
);
console.log(`  code and PIN are hashed; only the last four are recoverable.`);

await store.close();
