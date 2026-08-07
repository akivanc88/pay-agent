/**
 * Screenshot harness for the StreamCo biller portal (destination 3).
 *
 * StreamCo is not in the main `shoot.mjs` set because it is a separate simulated brand with its own
 * states. This drives all three that matter — the bill due, the bill paid, and the "markup changed"
 * glitch — at desktop and mobile, and writes PNGs a builder or critic reads off disk. It POSTs to the
 * settle/reset endpoints to move the account between states, and always leaves it back on "due".
 *
 * Usage:  node scripts/shoot-streamco.mjs <outDir>
 * Assumes web (:3001) is already running.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.WEB_URL ?? "http://localhost:3001";
const ACCOUNT = process.env.STREAMCO_ACCOUNT ?? "acct_demo";
const outDir = process.argv[2] ?? "/tmp/streamco-shots";

const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 1000 },
  { tag: "mobile", width: 390, height: 844 },
];

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
}

async function shoot(browser, name, url) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const path = `${outDir}/${name}-${vp.tag}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`  ✓ ${path}`);
    await ctx.close();
  }
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  // Bill due — the primary state.
  await post("/api/streamco/reset", { account: ACCOUNT });
  await shoot(browser, "streamco-due", `${BASE}/streamco/${ACCOUNT}`);

  // Markup changed — the amount is no longer scrapeable; the agent must report, not guess.
  await shoot(browser, "streamco-glitch", `${BASE}/streamco/${ACCOUNT}?glitch=1`);

  // Bill paid — the receipt state, after a simulated split settlement.
  await post("/api/streamco/settle", {
    account: ACCOUNT,
    handle: "pi_3TzDEMO0001",
    gift_drawn_minor: 2000,
    card_charged_minor: 2599,
  });
  await shoot(browser, "streamco-paid", `${BASE}/streamco/${ACCOUNT}`);
} finally {
  // Always leave the account back on "due" so the next run and the demo start clean.
  await post("/api/streamco/reset", { account: ACCOUNT });
  await browser.close();
}
console.log("streamco screenshots done");
