/** Owns cart state and composes the cart route's presentation sections. */

"use client";

import { SectionLabel } from "@/components/ui";
import type { CatalogProduct } from "@/lib/store";
import { useCart } from "@/lib/cart";

import { CartEmptyState } from "./cart-empty-state";
import { CartLineItems } from "./cart-line-items";
import { CartSkeleton } from "./cart-skeleton";
import { CartSuggestions } from "./cart-suggestions";
import { CartSummary } from "./cart-summary";
import styles from "./cart-view.module.css";

/**
 * The cart, as the browser sees it.
 *
 * Cart state lives in `localStorage`, so this half has to be a client component. It takes
 * `suggestions` as a prop rather than fetching them, because the catalogue is the server's
 * to read — see `page.tsx`, which is the server half.
 */
export function CartView({ suggestions }: { suggestions: CatalogProduct[] }) {
  const { lines, ready, count, total, setQuantity, remove, add } = useCart();

  if (ready && lines.length === 0) {
    return <CartEmptyState suggestions={suggestions} />;
  }

  const currency = lines[0]?.currency ?? "CAD";

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <SectionLabel>Fernbank &amp; Co · Florist</SectionLabel>
        <h1 className={styles.title}>Your cart</h1>
        {ready && count > 0 && (
          <p className={styles.count}>
            {count} {count === 1 ? "item" : "items"}, held for you until you check out
          </p>
        )}
      </div>

      {!ready ? (
        <CartSkeleton />
      ) : (
        <div className={styles.layout}>
          <div className={styles.itemsCol}>
            <CartLineItems lines={lines} onQuantity={setQuantity} onRemove={remove} />
            <CartSuggestions
              suggestions={suggestions}
              inCart={lines.map((line) => line.id)}
              onAdd={add}
            />
          </div>
          <CartSummary count={count} total={total} currency={currency} />
        </div>
      )}
    </div>
  );
}
