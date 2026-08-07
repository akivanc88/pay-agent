/**
 * Create a real, resumable StreamCo run that halts for approval — for demoing the inbox end to end.
 *
 * Unlike the seeded pending runs (historical data against stub destinations), this starts a genuine
 * run against the live StreamCo portal with a spend cap *below* the bill, so the policy gate halts it
 * into the approval inbox. Approving it in the dashboard then actually resumes and settles it against
 * the real destination (gift draw + test-mode card), because the destination is live.
 *
 *   pnpm --filter @pay-agent/agent streamco-approval
 *   → open http://localhost:3001/activity and approve it
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openConsentStore } from "@pay-agent/db";
import { issueIntentMandate, loadIssuerKey } from "@pay-agent/mandate";

import { streamco } from "../src/adapters/streamco.js";
import { startRun } from "../src/orchestrator.js";

const STORE = process.env.STORE_URL ?? "http://localhost:3000";
const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const consentPath =
  process.env.CONSENT_DB_PATH ?? join(dirname(fileURLToPath(import.meta.url)), "../../web/.data/consent.db");

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set (test key)");

  // Fresh bill so the amount is scrapeable and the eventual settle can mark it paid.
  await fetch(`${WEB}/api/streamco/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: "acct_demo" }),
  });

  const consent = openConsentStore(consentPath);
  const issuerKey = loadIssuerKey();
  const destination = streamco({ secretKey: key, storeBaseUrl: STORE, webBaseUrl: WEB });

  // Cap $20 < the $45.99 bill → the policy gate halts it for approval, nothing drawn.
  const outcome = await startRun(
    "acct_demo",
    { destination, funding: { giftCard: null, card: { token: "pm_card_visa", label: "Visa (test)" } }, consent, issuerKey },
    { userId: "demo-user", intent: issueIntentMandate({ userId: "demo-user", spendCapMinor: 2000, currency: "CAD", destinationAllowlist: ["streamco"], ttlSeconds: 3600 }, issuerKey) },
  );

  console.log(`Started run ${outcome.run.id} → ${outcome.status}`);
  if (outcome.status === "pending_approval") {
    console.log(`It exceeds the $20.00 cap and is waiting in the approval inbox.`);
    console.log(`Open ${WEB}/activity and click Approve — the agent service will settle it for real.`);
  }
  await consent.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
