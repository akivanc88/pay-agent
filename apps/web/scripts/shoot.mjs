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

/* A cart, seeded before page scripts run. Surfaces downstream of the shop are only worth
   looking at with something in them — an empty checkout screenshots its empty state, which
   is a different surface with a different job. Both are captured. */
const SEEDED_CART = [
  { id: "bouquet_roses", title: "Bouquet of Red Roses", price: 3500, currency: "CAD", quantity: 1 },
  { id: "gardenias", title: "Gardenias", price: 2000, currency: "CAD", quantity: 2 },
];

/** Surfaces to capture. `prep` runs after load, for flows that need driving. */
const SURFACES = [
  { name: "home", path: "/" },
  { name: "product", path: "/product/bouquet_roses" },
  { name: "wallet", path: "/wallet" },
  { name: "cart-empty", path: "/cart" },
  { name: "cart", path: "/cart", cart: SEEDED_CART },
  { name: "checkout-empty", path: "/checkout" },
  {
    name: "checkout",
    path: "/checkout",
    cart: SEEDED_CART,
    // Drive the flow to the state worth judging: the funding plan with a real split on it.
    prep: async (page) => {
      await page.locator('input[name="destination"]').first().check();
      await page.waitForSelector('input[name="shipping"]', { timeout: 10000 });
      await page.locator('input[name="shipping"]').first().check();
      await page.waitForTimeout(900);
      await page.fill("#gift-code", process.env.GIFT_CODE ?? "GC-DEMO-9111");
      await page.fill("#gift-pin", "1234");
      await page.waitForTimeout(300);
    },
  },
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
  if (only && surface.path !== only && surface.name !== only) continue;

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

      // The cart is seeded before any page script runs, so the surface renders filled on
      // its first paint rather than flickering from empty.
      await page.addInitScript((cart) => {
        try {
          if (cart) localStorage.setItem("pa-cart", JSON.stringify(cart));
          else localStorage.removeItem("pa-cart");
        } catch {}
      }, surface.cart ?? null);

      const url = `${BASE}${surface.path}`;
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);

      if (!res || res.status() >= 400) {
        console.log(`  ✗ ${surface.name} ${vp.tag}/${theme} → ${res ? res.status() : "no response"}`);
        await context.close();
        continue;
      }

      if (surface.prep) {
        try {
          await surface.prep(page);
        } catch (e) {
          console.log(`  ! ${surface.name} ${vp.tag}/${theme} prep: ${e.message.split("\n")[0]}`);
        }
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
