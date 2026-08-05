/** Presents the cart's designed empty state and server-provided catalogue suggestions. */

import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { StatePage } from "@/components/state-page";
import type { CatalogProduct } from "@/lib/store";

import styles from "./cart-empty-state.module.css";

export function CartEmptyState({ suggestions }: { suggestions: CatalogProduct[] }) {
  return (
    <StatePage
      eyebrow="Your cart"
      title="Your cart is empty"
      body="Nothing tied up yet. Pick something from this week’s cuttings and it’ll gather here, ready to check out with a gift card, a card, or both."
      action={suggestions.length === 0 ? { href: "/", label: "Browse the shop" } : undefined}
      art={
        <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M26 52h44l-5 32a5 5 0 0 1-5 4.5H36a5 5 0 0 1-5-4.5L26 52Z" opacity="0.5" />
          <path d="M48 48V22" />
          <path d="M48 40c-9-1-15-7-16-15 8 0 15 5 16 13M48 35c8-1 14-7 15-14-7 0-14 4-15 12" />
        </svg>
      }
    >
      {suggestions.length > 0 && (
        <section className={styles.suggest}>
          <h2 className={styles.suggestTitle}>This week&rsquo;s cuttings</h2>
          <div className={styles.suggestGrid}>
            {suggestions.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
          <Link href="/" className={styles.suggestMore}>
            Browse the full shop
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </section>
      )}
    </StatePage>
  );
}
