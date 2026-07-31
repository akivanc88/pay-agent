/**
 * Seed the storefront catalogue and inventory.
 *
 * The upstream UCP sample ships its catalogue inside committed `products.db` and
 * `transactions.db` binaries, with no seeding code at all. We seed in code instead, for
 * three reasons:
 *
 * 1. Binary files in git have opaque diffs and conflict badly.
 * 2. `.gitignore` excludes `*.db`, so committed databases would be excluded anyway — and
 *    a storefront that silently starts with an empty catalogue is a poor first experience
 *    for anyone cloning the repo.
 * 3. A seed script survives the move to Supabase; a SQLite binary does not.
 *
 * The catalogue matches the upstream sample's flower shop, so the UCP conformance
 * fixtures (`test_data/flower_shop`) still line up against our storefront.
 *
 * Run with: pnpm --filter @pay-agent/store seed
 */

import { getProductsDb, getTransactionsDb, initDbs } from "../src/data/db";

const CATALOGUE = [
  { id: "bouquet_roses", title: "Bouquet of Red Roses", price: 3500, stock: 10 },
  { id: "pot_ceramic", title: "Ceramic Pot", price: 1500, stock: 25 },
  { id: "bouquet_sunflowers", title: "Sunflower Bundle", price: 2500, stock: 15 },
  { id: "bouquet_tulips", title: "Spring Tulips", price: 3000, stock: 12 },
  { id: "orchid_white", title: "White Orchid", price: 4500, stock: 5 },
  { id: "gardenias", title: "Gardenias", price: 2000, stock: 8 },
] as const;

const productsPath = process.env["STORE_PRODUCTS_DB"] ?? "databases/products.db";
const transactionsPath = process.env["STORE_TRANSACTIONS_DB"] ?? "databases/transactions.db";

initDbs(productsPath, transactionsPath);

const products = getProductsDb();
const transactions = getTransactionsDb();

const upsertProduct = products.prepare(
  `INSERT INTO products (id, title, price, image_url) VALUES (?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET title = excluded.title,
                                 price = excluded.price,
                                 image_url = excluded.image_url`,
);
const upsertStock = transactions.prepare(
  `INSERT INTO inventory (product_id, quantity) VALUES (?, ?)
   ON CONFLICT(product_id) DO UPDATE SET quantity = excluded.quantity`,
);

// Idempotent: re-running resets prices and stock rather than duplicating or failing,
// which is what you want when re-seeding between demo runs.
for (const item of CATALOGUE) {
  upsertProduct.run(item.id, item.title, item.price, `https://example.com/${item.id}.jpg`);
  upsertStock.run(item.id, item.stock);
  console.log(
    `  ${item.id.padEnd(20)} $${(item.price / 100).toFixed(2).padStart(6)}   stock ${item.stock}`,
  );
}

console.log(`\nSeeded ${CATALOGUE.length} products into ${productsPath}.`);
