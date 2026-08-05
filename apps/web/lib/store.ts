/**
 * The one typed door onto `apps/store`.
 *
 * Server components call these directly (server → store, no CORS); the browser reaches the
 * same endpoints through the `/api/store/*` rewrite. Types mirror the store's real
 * responses — if the store contract changes, this file is where the web app finds out.
 */

const STORE_URL = process.env.STORE_URL ?? "http://localhost:3000";

export type { Catalog, CatalogProduct, FundingCard } from "@pay-agent/protocol";
import type { Catalog, CatalogProduct, FundingCard, FundingCardsResponse } from "@pay-agent/protocol";

/** Fetch the catalogue for the browse grid. `no-store` so a re-seed shows up immediately. */
export async function getCatalog(): Promise<Catalog> {
  const res = await fetch(`${STORE_URL}/products`, { cache: "no-store" });
  if (!res.ok) throw new Error(`store /products responded ${res.status}`);
  return res.json();
}

export async function getProduct(id: string): Promise<CatalogProduct | undefined> {
  const { products } = await getCatalog();
  return products.find((p) => p.id === id);
}

export async function getFundingCards(): Promise<FundingCard[]> {
  const res = await fetch(`${STORE_URL}/funding/cards`, { cache: "no-store" });
  if (!res.ok) throw new Error(`store /funding/cards responded ${res.status}`);
  const body = (await res.json()) as FundingCardsResponse;
  return body.cards;
}

/** Whether the store is reachable at all — surfaces a calm "start the store" state
 *  instead of an unhandled fetch error when someone opens the web app on its own. */
export async function storeIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${STORE_URL}/products`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
