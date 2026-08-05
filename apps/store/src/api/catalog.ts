/** Serves the human storefront catalog with live stock and integer merchant pricing. */

import { type Context } from "hono";

import { DEFAULT_CURRENCY } from "@pay-agent/db";
import type { Catalog } from "@pay-agent/protocol";

import { getInventory, listProducts } from "../data";

/**
 * The catalogue, for a human to browse.
 *
 * This is deliberately *not* part of the UCP contract. An agent is handed a cart id or a
 * payment reference and never window-shops; discovery for an agent is `/.well-known/ucp`.
 * But the web storefront is used by a person first, and a person needs to see what is for
 * sale before an agent can be asked to buy any of it.
 *
 * Prices are the ledger's own integer minor units, and the currency is the merchant's —
 * the same `DEFAULT_CURRENCY` the checkout is authoritative about. The client formats;
 * the wire stays in the unit the money is actually counted in, never a float.
 */
export class CatalogService {
  listProducts = (c: Context) => {
    const products = listProducts().map((product) => {
      // Stock is a live figure from the transactions db, not the catalogue, so an
      // out-of-stock item can be shown as such rather than only failing at checkout.
      const stock = getInventory(product.id) ?? 0;
      return {
        id: product.id,
        title: product.title,
        price: product.price,
        currency: DEFAULT_CURRENCY,
        image_url: product.image_url ?? null,
        in_stock: stock > 0,
        stock,
      };
    });

    const catalog: Catalog = { currency: DEFAULT_CURRENCY, products };
    return c.json(catalog);
  };
}
