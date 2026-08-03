/**
 * Layout regression gate.
 *
 * Two defects kept reappearing by hand-review only: a page that scrolls sideways on a phone,
 * and a control too small to hit with a thumb. Both are objectively measurable, both are
 * invisible at the 1440px width surfaces get built at, and both are the kind of thing a
 * screenshot review notices only when someone thinks to look. So they are asserted.
 *
 * Usage:  node scripts/layout-audit.mjs
 * Assumes the store (:3000) and web (:3001) are already running. Exits non-zero on failure.
 */
import { chromium } from "playwright";

const BASE = process.env.WEB_URL ?? "http://localhost:3001";

/* WCAG 2.5.5 asks for 44×44. Anything interactive on a touch viewport has to clear it. */
const MIN_TARGET = 44;

const CART = [
  { id: "bouquet_roses", title: "Bouquet of Red Roses", price: 3500, currency: "CAD", quantity: 1 },
  { id: "gardenias", title: "Gardenias", price: 2000, currency: "CAD", quantity: 2 },
];

const PATHS = ["/", "/cart", "/checkout", "/wallet", "/product/bouquet_roses", "/no-such-page"];

const browser = await chromium.launch();
let failures = 0;

for (const path of PATHS) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript((c) => {
    try { localStorage.setItem("pa-cart", JSON.stringify(c)); } catch {}
  }, CART);
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(400);

  const report = await page.evaluate((min) => {
    const doc = document.documentElement;

    /* Only elements laid out in normal flow can push the document sideways. Anything inside
       an <svg> is clipped by its viewBox, so a wide child there is not an overflow. */
    const overflowing = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("svg")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 0.5) {
        overflowing.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 44),
          right: +r.right.toFixed(1),
        });
      }
    }

    /* A small control inside a large label (a radio in its row, say) is reachable by the
       label, so the *effective* target is measured, not the input's own box. */
    const small = [];
    for (const el of document.querySelectorAll("a, button, input, select, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const label = el.closest("label");
      const box = label ? label.getBoundingClientRect() : r;
      if (box.height < min - 0.5 || box.width < min - 0.5) {
        small.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 40),
          text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24),
          w: +box.width.toFixed(1),
          h: +box.height.toFixed(1),
        });
      }
    }

    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, overflowing, small };
  }, MIN_TARGET);

  const scrolls = report.scrollWidth > report.clientWidth;
  const ok = !scrolls && report.small.length === 0;
  if (!ok) failures++;

  console.log(`\n${ok ? "PASS" : "FAIL"}  ${path}`);
  if (scrolls) {
    console.log(`  horizontal scroll: ${report.scrollWidth} > ${report.clientWidth}`);
    for (const o of report.overflowing.slice(0, 5)) {
      console.log(`    ${o.tag}.${o.cls} right=${o.right}`);
    }
  }
  for (const s of report.small) {
    console.log(`  target ${s.w}×${s.h} < ${MIN_TARGET}: ${s.tag}.${s.cls} "${s.text}"`);
  }

  await ctx.close();
}

await browser.close();

if (failures) {
  console.error(`\n${failures} surface(s) failed the 390px layout audit.`);
  process.exit(1);
}
console.log("\nAll surfaces: no horizontal scroll, no sub-44px targets at 390px.");
