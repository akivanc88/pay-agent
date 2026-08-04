/**
 * Drive a real split payment end to end, through the browser, against the real store.
 *
 * This is the functional proof that the checkout surface works: a gift card is drawn
 * first and a real Stripe test-mode card is authorized for the remainder. It asserts on
 * the order id the store returns, not on anything the UI made up.
 */
import { chromium } from "playwright";

const BASE = process.env.WEB_URL ?? "http://localhost:3001";
const DECLINE = process.argv.includes("--decline");

/* A successful run spends the card down, so a repeat run against the same code would draw
   $0 and prove nothing about the split. Issue a fresh card and pass it in:
     pnpm --filter @pay-agent/store issue-card GC-DEMO-8888 1234 20.00
     GIFT_CODE=GC-DEMO-8888 node scripts/pay-e2e.mjs                          */
const GIFT_CODE = process.env.GIFT_CODE ?? "GC-DEMO-7777";
const GIFT_PIN = process.env.GIFT_PIN ?? "1234";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });

// Seed a cart before any page script runs, the same way a shopper would have filled it.
await context.addInitScript(() => {
  localStorage.setItem(
    "pa-cart",
    JSON.stringify([
      { id: "bouquet_roses", title: "Bouquet of Red Roses", price: 3500, currency: "CAD", quantity: 1 },
    ]),
  );
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });

const step = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (e) {
    console.log(`  FAIL ${label}: ${e.message}`);
    throw e;
  }
};

await step("checkout opened with line items", async () => {
  await page.waitForSelector("text=Bouquet of Red Roses", { timeout: 15000 });
});

await step("select destination", async () => {
  await page.locator('input[name="destination"]').first().check();
  await page.waitForSelector('input[name="shipping"]', { timeout: 10000 });
});

await step("select delivery option", async () => {
  await page.locator('input[name="shipping"]').first().check();
  // The total settles on this call; wait for the funding plan to reflect it.
  await page.waitForTimeout(1200);
});

await step("enter gift card", async () => {
  await page.fill("#gift-code", GIFT_CODE);
  await page.fill("#gift-pin", GIFT_PIN);
});

await step("select card", async () => {
  const value = DECLINE ? "pm_card_chargeDeclinedInsufficientFunds" : "pm_card_visa";
  await page.locator(`input[name="card"][value="${value}"]`).check();
});

const planText = await page.locator("dl").first().innerText();
console.log("\n--- funding plan as rendered ---");
console.log(planText.split("\n").map((l) => "  " + l).join("\n"));
console.log("-------------------------------\n");

await step("pay", async () => {
  const btn = page.getByRole("button", { name: /^Pay/ });
  await btn.waitFor({ state: "visible", timeout: 10000 });
  if (await btn.isDisabled()) throw new Error("pay button is disabled");
  await btn.click();
});

if (DECLINE) {
  await step("decline is reported honestly", async () => {
    await page.waitForSelector("text=Not paid", { timeout: 25000 });
    // Next mounts its own always-present route announcer with role="alert", so the
    // decline panel has to be picked out by its content rather than by role alone.
    const alert = await page
      .locator('[role="alert"]')
      .filter({ hasText: "Not paid" })
      .innerText();
    console.log("\n--- decline as rendered ---");
    console.log(alert.split("\n").map((l) => "  " + l).join("\n"));
    console.log("---------------------------\n");
    if (!/restored|reversed|exactly what they were/i.test(alert)) {
      throw new Error("decline does not state that balances were restored");
    }
  });
} else {
  await step("order confirmed", async () => {
    await page.waitForSelector("text=Paid.", { timeout: 25000 });
  });
  await step("order id is shown", async () => {
    const orderId = await page
      .locator("p")
      .filter({ hasText: /^ord_[0-9a-f-]{36}$/ })
      .first()
      .innerText();
    console.log(`\n  ORDER ID: ${orderId}\n`);
  });
}

if (errors.length) {
  console.log("BROWSER ERRORS:");
  for (const e of errors) console.log("  " + e);
}

await browser.close();
console.log(errors.length ? "DONE (with browser errors)" : "DONE clean");
