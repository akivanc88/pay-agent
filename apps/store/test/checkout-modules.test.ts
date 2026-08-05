/** Characterizes the extracted checkout modules independently of the HTTP facade. */

import assert from "node:assert/strict";
import { before, test } from "node:test";

import { getInventory } from "../src/data";
import { getProductsDb, getTransactionsDb, initDbs } from "../src/data/db";
import { computeIdempotencyHash } from "../src/checkout/idempotency";
import { InventoryReservation } from "../src/checkout/order";

before(() => {
  initDbs(":memory:", ":memory:");
  getProductsDb()
    .prepare(
      "INSERT INTO products (id, title, price, image_url) VALUES (?, ?, ?, ?)",
    )
    .run("cleanup_product", "Cleanup Product", 1000, "");
  getTransactionsDb()
    .prepare("INSERT INTO inventory (product_id, quantity) VALUES (?, ?)")
    .run("cleanup_product", 3);
});

test("idempotency hashing is stable across object key order", () => {
  assert.equal(
    computeIdempotencyHash({ payment: { token: "x", type: "card" }, amount: 10 }),
    computeIdempotencyHash({ amount: 10, payment: { type: "card", token: "x" } }),
  );
});

test("unexpected cleanup releases reserved inventory exactly once", () => {
  const reservation = new InventoryReservation();
  const checkout = {
    line_items: [
      { item: { id: "cleanup_product" }, quantity: 2 },
    ],
  } as never;

  try {
    assert.equal(reservation.reserve(checkout), undefined);
    assert.equal(getInventory("cleanup_product"), 1);
    throw new Error("unexpected failure after reservation");
  } catch {
    reservation.release();
  } finally {
    // The completion backstop and a handled path may both request rollback.
    reservation.release();
  }

  assert.equal(getInventory("cleanup_product"), 3);
});
