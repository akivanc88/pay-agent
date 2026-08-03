/**
 * Acceptance test for the gift-card showpiece.
 *
 * The 3D card exists to be a *better* rendering of the same object the still SVG draws. It
 * is very easy for it to quietly become a worse one — a lighting rig that clips the foil,
 * or an albedo that letters the wordmark in a near-white background tint, and the brand mark
 * dissolves into the card while every automated check still passes.
 *
 * So this measures the thing that matters: how legible the foil wordmark is against the card
 * face, in both renderings, and fails if the lit version is meaningfully worse than the flat
 * one it covers. Measured as the luminance spread (p95 − p5) across the band containing
 * "pay·agent", which is high when there is lettering and near zero when the letters have been
 * washed into the background.
 *
 * Usage:  node scripts/card-contrast.mjs
 * Assumes the store (:3000) and web (:3001) are already running.
 */
import { chromium } from "playwright";

const BASE = process.env.WEB_URL ?? "http://localhost:3001";

/* The wordmark sits at (52, 45) in the card's own 400×252 texture space. This band is that
   neighbourhood, in fractions of the rendered element, widened enough to survive the card's
   resting tilt. */
const BAND = { x0: 0.08, x1: 0.55, y0: 0.08, y1: 0.24 };

/** Decode a PNG and report the luminance spread within BAND, using a browser as the codec. */
async function spread(page, pngBuffer) {
  return page.evaluate(
    async ({ dataUrl, band }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const x = Math.floor(img.width * band.x0);
      const y = Math.floor(img.height * band.y0);
      const w = Math.max(1, Math.floor(img.width * (band.x1 - band.x0)));
      const h = Math.max(1, Math.floor(img.height * (band.y1 - band.y0)));
      const { data } = ctx.getImageData(x, y, w, h);

      const lum = [];
      for (let i = 0; i < data.length; i += 4) {
        // Rec. 709 luma on sRGB values — we want perceived lightness spread, not physics.
        lum.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      }
      lum.sort((a, b) => a - b);
      const at = (q) => lum[Math.min(lum.length - 1, Math.floor(lum.length * q))];
      return { p5: at(0.05), p95: at(0.95), spread: at(0.95) - at(0.05), px: lum.length };
    },
    { dataUrl: `data:image/png;base64,${pngBuffer.toString("base64")}`, band: BAND },
  );
}

const results = {};

for (const theme of ["light", "dark"]) {
  /* A browser per theme. Headless Chromium hands out a small number of WebGL contexts per
     process and does not reclaim them promptly when a browser *context* closes, so a single
     instance measures whichever theme runs first and reports the second as "no WebGL". */
  const browser = await chromium.launch();

  /* The still card: reduced motion means the WebGL effect returns before importing three,
     so the SVG stays at full opacity and is the only thing on screen. */
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      try { localStorage.setItem("pa-theme", t); } catch {}
    }, theme);
    await page.goto(`${BASE}/wallet`, { waitUntil: "networkidle", timeout: 45000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);

    const still = page.locator('[class*="still"]').first();
    await still.waitFor({ state: "visible", timeout: 10000 });
    results[`still-${theme}`] = await spread(page, await still.screenshot());
    await ctx.close();
  }

  /* The lit card: wait for the host to actually go live, so we never measure the still SVG
     showing through a canvas that hasn't drawn yet. */
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      try { localStorage.setItem("pa-theme", t); } catch {}
    }, theme);
    await page.goto(`${BASE}/wallet`, { waitUntil: "networkidle", timeout: 45000 });
    await page.evaluate(() => document.fonts?.ready);

    const live = await page
      .waitForSelector("[data-live]", { timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (!live) {
      console.log(`  ! ${theme}: card never went live — no lit measurement`);
    } else {
      await page.waitForTimeout(900);
      const canvas = page.locator("canvas").first();
      results[`lit-${theme}`] = await spread(page, await canvas.screenshot());
    }
    await ctx.close();
  }

  await browser.close();
}

console.log("\nWordmark-band luminance spread (higher = the brand mark is actually visible)\n");
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${k.padEnd(12)} p5 ${v.p5.toFixed(1).padStart(6)}   p95 ${v.p95.toFixed(1).padStart(6)}   spread ${v.spread.toFixed(1).padStart(6)}`);
}

/* The lit render is allowed to be softer than the flat one — it is a lit object, and some
   roll-off is the point. It is not allowed to be a wash. */
const MIN_RATIO = 0.6;
let failed = 0;
for (const theme of ["light", "dark"]) {
  const still = results[`still-${theme}`];
  const lit = results[`lit-${theme}`];
  /* A theme we could not measure is a failure, not a pass. Silently skipping is how a
     regression in the lit render would sail through this check. */
  if (!still || !lit) {
    console.log(`\n  FAIL ${theme}: no measurement (still=${!!still}, lit=${!!lit})`);
    failed++;
    continue;
  }
  const ratio = lit.spread / still.spread;
  const ok = ratio >= MIN_RATIO;
  if (!ok) failed++;
  console.log(
    `\n  ${ok ? "PASS" : "FAIL"} ${theme}: lit/still = ${ratio.toFixed(2)} (floor ${MIN_RATIO})`,
  );
}

if (failed) {
  console.error(`\n${failed} theme(s) render the wordmark worse lit than flat.`);
  process.exit(1);
}
console.log("\nThe lit card holds its lettering in both themes.");
