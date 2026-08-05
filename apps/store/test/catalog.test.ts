/** Verifies catalog pricing, currency, stock, and product response contracts. */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Hono } from "hono";

import { CatalogService } from "../src/api/catalog";
import { getProductsDb, getTransactionsDb, initDbs } from "../src/data/db";

// A throwaway pair of databases so the test does not depend on a seeded checkout of the
// repo — the catalogue endpoint is asserted against data this test puts there itself.
const dir = mkdtempSync(join(tmpdir(), "pay-agent-catalog-"));

before(() => {
  initDbs(join(dir, "products.db"), join(dir, "transactions.db"));

  const products = getProductsDb();
  products
    .prepare("INSERT INTO products (id, title, price, image_url) VALUES (?, ?, ?, ?)")
    .run("bouquet_roses", "Bouquet of Red Roses", 3500, "https://example.com/roses.jpg");
  products
    .prepare("INSERT INTO products (id, title, price, image_url) VALUES (?, ?, ?, ?)")
    .run("orchid_white", "White Orchid", 4500, null);

  const transactions = getTransactionsDb();
  transactions
    .prepare("INSERT INTO inventory (product_id, quantity) VALUES (?, ?)")
    .run("bouquet_roses", 10);
  transactions
    .prepare("INSERT INTO inventory (product_id, quantity) VALUES (?, ?)")
    .run("orchid_white", 0);
});

after(() => rmSync(dir, { recursive: true, force: true }));

type CatalogResponse = {
  currency: string;
  products: Array<{
    id: string;
    title: string;
    price: number;
    currency: string;
    image_url: string | null;
    in_stock: boolean;
    stock: number;
  }>;
};

test("GET /products returns the catalogue in minor units with live stock", async () => {
  const app = new Hono();
  app.get("/products", new CatalogService().listProducts);

  const response = await app.request("/products");
  assert.equal(response.status, 200);

  const body = (await response.json()) as CatalogResponse;
  assert.equal(body.currency, "CAD");
  assert.equal(body.products.length, 2);

  // Ordered by id: "bouquet_roses" sorts before "orchid_white".
  const [roses, orchid] = body.products;

  assert.equal(roses?.id, "bouquet_roses");
  // Price stays an integer number of cents on the wire — never a float dollar amount.
  assert.equal(roses?.price, 3500);
  assert.equal(roses?.currency, "CAD");
  assert.equal(roses?.in_stock, true);
  assert.equal(roses?.stock, 10);
  assert.equal(roses?.image_url, "https://example.com/roses.jpg");

  // A zero-stock product is still listed, but marked out of stock rather than hidden —
  // the storefront decides how to render it; the endpoint does not lie about it.
  assert.equal(orchid?.id, "orchid_white");
  assert.equal(orchid?.in_stock, false);
  assert.equal(orchid?.stock, 0);
  // A missing image is null on the wire, never the string "null" or an empty string.
  assert.equal(orchid?.image_url, null);
});
