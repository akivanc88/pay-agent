/**
 * Capture reference screenshots of real, shipping commerce surfaces.
 *
 * The rubric's standard is a *blind comparison* — put ours beside the real thing and say
 * which is the product. A critic working from memory of what Stripe Checkout looks like is
 * not doing that comparison; it is doing a vibe check. So the real surfaces get captured
 * and the critic is handed both images.
 *
 * These are third-party marketing and demo pages, captured read-only for design comparison.
 * Nothing here is redistributed and nothing is checked in — output goes to a scratch dir.
 *
 * Usage:  node scripts/reference-shots.mjs [outDir]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const outDir = process.argv[2] ?? "/tmp/pay-agent-refs";

/* Cookie/consent walls are the main thing standing between a fresh context and a clean
   screenshot. These are the selectors the target sites actually use. */
const DISMISS = [
  // Cookiebot (Farmgirl) — the dialog is its own overlay and outlives a generic click.
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "#CybotCookiebotDialogBodyLevelButtonAccept",
  "#CybotCookiebotDialogBodyButtonAccept",
  "#CybotCookiebotDialogBodyButtonDecline",
  // OneTrust / TrustArc.
  "#onetrust-accept-btn-handler",
  "#truste-consent-button",
  // Generic, matching any element rather than only <button> — several of these are <a>.
  "[aria-label='Accept all']",
  "[aria-label='Close']",
  ":is(button,a,div[role=button]):has-text('Allow all')",
  ":is(button,a,div[role=button]):has-text('Accept All')",
  ":is(button,a,div[role=button]):has-text('Accept all')",
  ":is(button,a,div[role=button]):has-text('Accept')",
  ":is(button,a,div[role=button]):has-text('Got it')",
  ":is(button,a,div[role=button]):has-text('No thanks')",
];

/** Last resort: strip fixed/sticky overlays that survived every dismissal above. */
async function stripOverlays(page) {
  await page.evaluate(() => {
    const KEY = /cookie|consent|gdpr|privacy|newsletter|modal|popup|klaviyo|attentive/i;
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      // Only large overlays, and never the site's own top navigation.
      if (r.height < 120 || r.top < 80) continue;
      const id = `${el.id} ${el.className}`;
      if (KEY.test(id) || r.height > window.innerHeight * 0.25) el.remove();
    }
  });
}

const TARGETS = [
  // Premium DTC florists — the storefront and PDP reference set.
  { name: "ref-bouqs-home", url: "https://www.bouqs.com/" },
  { name: "ref-farmgirl-home", url: "https://www.farmgirlflowers.com/" },
  { name: "ref-flowerbx-home", url: "https://www.flowerbx.com/" },
  // Stripe's own Checkout demo. The landing page is only a chooser — the reference we
  // actually want is the real hosted Checkout behind "View demo", which is a live Checkout
  // Session and the exact surface our checkout is measured against.
  {
    name: "ref-stripe-checkout",
    url: "https://checkout.stripe.dev/",
    prep: async (page, ctx) => {
      const opened = ctx.waitForEvent("page", { timeout: 15000 }).catch(() => null);
      await page.locator(":is(button,a):has-text('View demo')").first().click({ timeout: 10000 });
      // It may open a tab or navigate in place; take whichever actually happened.
      const tab = await opened;
      const target = tab ?? page;
      await target.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
      await target.waitForTimeout(5000);
      return target;
    },
  },
];

const browser = await chromium.launch();
await mkdir(outDir, { recursive: true });

let n = 0;
for (const t of TARGETS) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3500);

    for (const sel of DISMISS) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 500 })) {
          await el.click({ timeout: 1500 });
          await page.waitForTimeout(600);
        }
      } catch {}
    }

    // A prep step may hand back a different page than the one we started on.
    const shot = t.prep ? ((await t.prep(page, ctx)) ?? page) : page;

    await stripOverlays(shot);
    await shot.evaluate(() => document.fonts?.ready);
    await shot.waitForTimeout(1200);
    const file = `${outDir}/${t.name}.png`;
    await shot.screenshot({ path: file });
    console.log(`  ✓ ${file}`);
    n++;
  } catch (e) {
    console.log(`  ✗ ${t.name}: ${String(e.message).split("\n")[0]}`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${n} reference shots → ${outDir}`);
