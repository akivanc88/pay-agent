import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ucpStorefront } from "../src/adapters/ucp-storefront.js";
import type { AmountDue, InstrumentPlan, Mandate } from "../src/destination.js";

/**
 * The storefront adapter's failure honesty, at the seam.
 *
 * `pay()` must never assert an outcome it did not observe: an ambiguous response (a 5xx) is
 * resolved by *reading* the order, never by re-POSTing a completion, and a definite decline
 * reports `reversed: false` — the store reverses its own internal draw, but that reversal is
 * invisible from here, so the adapter does not claim it. These tests stub `fetch` so the adapter
 * meets the exact wire shapes the store returns, without a live server.
 */

/** Swap global fetch for a dispatcher keyed on method + path; returns a restore function. */
function stubFetch(
  handler: (url: string, init: { method?: string }) => Response,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) =>
    handler(String(input), init ?? {})) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function sessionBody(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "sess_1",
    status: "ready",
    currency: "CAD",
    line_items: [],
    totals: [],
    ...over,
  });
}

const plan: InstrumentPlan = {
  amountMinor: 7500,
  currency: "CAD",
  giftDrawMinor: 2000,
  cardMinor: 5500,
  uncoveredMinor: 0,
  giftCard: { code: "GC-TEST-0001", pin: "1234", hintMinor: 2000, verified: true },
  card: { token: "pm_card_visa", label: "Visa" },
};

const due: AmountDue = {
  destinationId: "ucp-storefront",
  reference: "bouquet_roses:1",
  amountMinor: 7500,
  currency: "CAD",
  description: "storefront cart (1 line)",
  handle: "sess_1",
};

const mandate: Mandate = {
  reference: due.reference,
  destinationId: due.destinationId,
  amountMinor: due.amountMinor,
  currency: due.currency,
  createdAt: "2026-01-01T00:00:00.000Z",
  signed: false,
};

test("a 502 with no order on read is indeterminate and reverses nothing", async () => {
  // The store's capture was unknowable and it answered 502. The adapter must read the order
  // (there is none), report indeterminate, and — crucially — never claim a reversal it can't see.
  let posts = 0;
  const restore = stubFetch((url, init) => {
    if (init.method === "POST" && url.endsWith("/complete")) {
      posts += 1;
      return new Response(JSON.stringify({ detail: "capture indeterminate" }), { status: 502 });
    }
    return new Response(sessionBody(), { status: 200 }); // GET session: no order attached
  });
  try {
    const res = await ucpStorefront({ baseUrl: "http://store.test" }).pay(plan, mandate, due);
    assert.equal(res.ok, false);
    assert.equal(res.reversed, false, "an unobserved 502 must not be reported as reversed");
    assert.match(res.detail, /indeterminate/);
    assert.equal(posts, 1, "an ambiguous outcome is read, never re-POSTed");
  } finally {
    restore();
  }
});

test("a 502 whose order exists on read resolves to settled by reading", async () => {
  // Same 502, but the completion actually went through — the order exists. Reading it (not
  // retrying the payment) is what surfaces the truth, and it is reported settled.
  let posts = 0;
  const restore = stubFetch((url, init) => {
    if (init.method === "POST" && url.endsWith("/complete")) {
      posts += 1;
      return new Response(JSON.stringify({ detail: "gateway" }), { status: 502 });
    }
    return new Response(sessionBody({ status: "completed", order: { id: "ord_9" } }), { status: 200 });
  });
  try {
    const res = await ucpStorefront({ baseUrl: "http://store.test" }).pay(plan, mandate, due);
    assert.equal(res.ok, true);
    assert.equal(res.handle, "ord_9", "the read resolves the real order id");
    assert.equal(res.reversed, false);
    assert.equal(posts, 1, "resolved by reading, exactly one completion POST");
  } finally {
    restore();
  }
});

test("a definite decline reports reversed:false — the store's internal reversal is unobserved", async () => {
  // A 402 is a definite store failure. The store reverses any draw it made internally, but that
  // reversal is best-effort and invisible from here, so the adapter reports reversed:false rather
  // than inferring a reversal from the fact that a gift draw was planned.
  const restore = stubFetch((url, init) => {
    if (init.method === "POST" && url.endsWith("/complete")) {
      return new Response(
        JSON.stringify({ detail: "Your card was declined.", code: "card_declined" }),
        { status: 402 },
      );
    }
    return new Response(sessionBody(), { status: 200 });
  });
  try {
    const res = await ucpStorefront({ baseUrl: "http://store.test" }).pay(plan, mandate, due);
    assert.equal(res.ok, false);
    assert.equal(res.reversed, false, "we drew no gift ourselves and observed no reversal");
    assert.match(res.detail, /declined/);
  } finally {
    restore();
  }
});
