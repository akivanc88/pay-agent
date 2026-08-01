/**
 * Screenshot harness.
 *
 * Drives every surface at desktop and mobile, in light and dark, and writes PNGs for
 * visual review. This is what the design critic looks at — a surface is not "done" because
 * it compiles, it is done when it survives being looked at next to a real payment flow.
 *
 * Usage:  node scripts/shoot.mjs [outDir] [--only=/path]
 * Assumes the store (:3000) and web (:3001) are already running.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.WEB_URL ?? "http://localhost:3001";
const outDir = process.argv[2] ?? "/tmp/pay-agent-shots";
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

/** Surfaces to capture. `prep` runs before the shot for flows that need driving. */
const SURFACES = [
  { name: "home", path: "/" },
  { name: "product", path: "/product/bouquet_roses" },
  { name: "wallet", path: "/wallet" },
  { name: "checkout", path: "/checkout" },
];

const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 1000 },
  { tag: "mobile", width: 390, height: 844 },
];
const THEMES = ["light", "dark"];

const browser = await chromium.launch();
await mkdir(outDir, { recursive: true });

let shots = 0;
for (const surface of SURFACES) {
  if (only && surface.path !== only) continue;

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      const page = await context.newPage();

      // Apply the explicit theme the same way the real toggle does, so the shot matches
      // what a user who picked a theme actually sees.
      await page.addInitScript((t) => {
        try { localStorage.setItem("pa-theme", t); } catch {}
      }, theme);

      const url = `${BASE}${surface.path}`;
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);

      if (!res || res.status() >= 400) {
        console.log(`  ✗ ${surface.name} ${vp.tag}/${theme} → ${res ? res.status() : "no response"}`);
        await context.close();
        continue;
      }

      // Let fonts settle and entrance animations finish so nothing is caught mid-fade.
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(700);

      const file = `${outDir}/${surface.name}-${vp.tag}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: vp.tag === "desktop" });
      console.log(`  ✓ ${file}`);
      shots++;
      await context.close();
    }
  }
}

await browser.close();
console.log(`\n${shots} screenshots → ${outDir}`);
