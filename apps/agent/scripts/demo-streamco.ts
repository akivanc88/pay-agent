/**
 * The M3 marquee: pay StreamCo — a destination with no payment API — through the full consent loop.
 *
 * This is the whole thesis in one run. The agent scrapes the amount off a human billing page (there
 * is no API to ask), checks it against the user's signed IntentMandate, issues signed Checkout and
 * Payment mandates, draws the gift card on our ledger and settles the remainder on a real test-mode
 * card, tells StreamCo out-of-band, and confirms by re-reading the page. Every step is written to the
 * shared consent store, so the run then shows up in the dashboard's approval inbox / timeline.
 *
 *   pnpm --filter @pay-agent/agent demo:streamco
 *
 * Needs both servers (store :3000, web :3001) and a Stripe test key. Resets the StreamCo bill first.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openConsentStore } from "@pay-agent/db";
import { issueIntentMandate, loadIssuerKey } from "@pay-agent/mandate";

import { streamco } from "../src/adapters/streamco.js";
import { startRun } from "../src/orchestrator.js";

const STORE = process.env.STORE_URL ?? "http://localhost:3000";
const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const ACCOUNT = "acct_demo";
const here = dirname(fileURLToPath(import.meta.url));
const storeDir = join(here, "../../store");
const consentPath = process.env.CONSENT_DB_PATH ?? join(here, "../../web/.data/consent.db");

function issueCard(dollars: number): { code: string; pin: string } {
  const code = `GC-SC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  execFileSync("pnpm", ["issue-card", code, "1234", dollars.toFixed(2)], { cwd: storeDir, stdio: "ignore" });
  return { code, pin: "1234" };
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set (test key)");

  // Fresh bill.
  await fetch(`${WEB}/api/streamco/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: ACCOUNT }),
  });

  const gift = issueCard(20); // $20 gift; StreamCo is $45.99, so the card covers the $25.99 remainder.
  const destination = streamco({ secretKey: key, storeBaseUrl: STORE, webBaseUrl: WEB });
  const issuerKey = loadIssuerKey();
  const consent = openConsentStore(consentPath);

  const outcome = await startRun(
    ACCOUNT,
    {
      destination,
      funding: {
        giftCard: { ...gift, hintMinor: 2000, verified: true },
        card: { token: "pm_card_visa", label: "Visa (test)" },
      },
      consent,
      issuerKey,
    },
    {
      userId: "demo-user",
      intent: issueIntentMandate(
        { userId: "demo-user", spendCapMinor: 10000, currency: "CAD", destinationAllowlist: ["streamco"], ttlSeconds: 3600 },
        issuerKey,
      ),
    },
  );

  console.log(`\n\x1b[1mStreamCo — no payment API; the agent read the page.\x1b[0m`);
  for (const ev of await consent.eventsForRun(outcome.run.id)) {
    console.log(`  ${ev.kind.padEnd(18)} ${ev.summary}`);
  }
  const settled = outcome.status === "settled";
  console.log(`  \x1b[${settled ? "32" : "31"}m${outcome.status.toUpperCase()}\x1b[0m`);

  // Confirm by re-reading the page like the adapter does.
  const paid = /\bpaid\b/i.test(await (await fetch(`${WEB}/streamco/${ACCOUNT}`)).text());
  console.log(`  portal now shows: ${paid ? "PAID" : "still due"}`);
  console.log(`\n  Run ${outcome.run.id} recorded — see it at ${WEB}/activity`);
  await consent.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
