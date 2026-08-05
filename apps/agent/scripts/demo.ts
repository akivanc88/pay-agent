/**
 * The M2 demo: one planner, many destinations.
 *
 *   pnpm demo:ucp    a gift-card + card split settled on the UCP storefront
 *   pnpm demo:link   the same planner settling an external Stripe payment link
 *   pnpm demo:both   both, back to back — the architectural point
 *
 * Self-contained: it issues its own fresh gift cards (via the store's issue-card script) and creates
 * its own Stripe test payment link, so the run is reproducible from nothing but two live servers.
 * Assumes the store is on :3000 and STRIPE_SECRET_KEY is a test key.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Stripe from "stripe";

import { ucpStorefront } from "../src/adapters/ucp-storefront.js";
import { stripePaymentLink } from "../src/adapters/payment-link.js";
import { runPayment, type RunResult } from "../src/planner.js";
import type { Funding, PaymentDestination } from "../src/destination.js";

const STORE = process.env["STORE_URL"] ?? "http://localhost:3000";
const storeDir = join(dirname(fileURLToPath(import.meta.url)), "../../store");
const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();

/** Issue a fresh closed-loop gift card via the store's admin script, and return its code. */
function issueCard(dollars: number): { code: string; pin: string } {
  const code = `GC-DEMO-${suffix}-${Math.floor(dollars)}`;
  execFileSync("pnpm", ["issue-card", code, "1234", dollars.toFixed(2)], {
    cwd: storeDir,
    stdio: "ignore",
  });
  return { code, pin: "1234" };
}

const card = { token: "pm_card_visa", label: "Visa (test)" } as const;

function report(title: string, run: RunResult): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
  for (const line of run.log) console.log("  " + line);
  const settled = run.status.settled && run.result.ok;
  console.log(`  \x1b[${settled ? "32" : "31"}m${settled ? "SETTLED" : "NOT SETTLED"}\x1b[0m`);
}

async function drive(dest: PaymentDestination, reference: string, funding: Funding, title: string) {
  const run = await runPayment(dest, reference, funding);
  report(title, run);
  return run;
}

async function ucp(): Promise<void> {
  const gift = issueCard(20);
  await drive(
    ucpStorefront({ baseUrl: STORE }),
    "bouquet_roses:1,gardenias:2",
    { giftCard: { ...gift, hintMinor: 2000, verified: true }, card },
    "UCP storefront — spec-native, redeems the gift card itself",
  );
}

async function link(): Promise<void> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("STRIPE_SECRET_KEY not set (test key)");
  const stripe = new Stripe(key);
  const product = await stripe.products.create({ name: "Demo item" });
  const price = await stripe.prices.create({ product: product.id, unit_amount: 5000, currency: "cad" });
  const plink = await stripe.paymentLinks.create({ line_items: [{ price: price.id, quantity: 1 }] });

  const gift = issueCard(15);
  await drive(
    stripePaymentLink({ secretKey: key, storeBaseUrl: STORE }),
    plink.id,
    { giftCard: { ...gift, hintMinor: 1500, verified: true }, card },
    "Stripe payment link — external rail, split happens on our side",
  );
}

const mode = process.argv[2] ?? "both";
if (mode === "ucp") await ucp();
else if (mode === "link") await link();
else {
  await ucp();
  await link();
  console.log(
    "\n\x1b[2mOne planner (src/planner.ts) settled both — a spec-native storefront and an\n" +
      "external card rail — with no branch on which destination it was. The adapters absorbed\n" +
      "every difference; test/independence.test.ts asserts the planner never learns their names.\x1b[0m",
  );
}
