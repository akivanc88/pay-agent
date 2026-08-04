import type { Metadata } from "next";

import { getCatalog } from "@/lib/store";

import { CartView } from "./cart-view";

export const metadata: Metadata = {
  title: "Cart — pay-agent",
  description: "What you're about to buy, before the store quotes delivery and tax on it.",
};

export const dynamic = "force-dynamic";

/**
 * The server half of the cart.
 *
 * The cart itself lives in `localStorage` and so has to be rendered on the client, but the
 * catalogue does not — reading it here means an empty cart can offer real products instead
 * of a dead end, without the browser making a second round trip to find them.
 *
 * A catalogue failure is not a cart failure: if the store is unreachable the cart still has
 * to render, so the suggestions degrade to nothing and the empty state falls back to its
 * plain "browse the shop" call to action.
 */
export default async function CartPage() {
  const products = await getCatalog()
    .then((c) => c.products.slice(0, 3))
    .catch(() => []);

  return <CartView suggestions={products} />;
}
