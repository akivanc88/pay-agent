/** Presents in-stock cart suggestions and owns their transient add confirmation. */

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button, Money, Panel, SectionLabel } from "@/components/ui";
import { ProductArt } from "@/components/product-art";
import type { CartLine } from "@/lib/cart";
import type { CatalogProduct } from "@/lib/store";

import collapseStyles from "./cart-row-collapse.module.css";
import styles from "./cart-suggestions.module.css";

type CartSuggestionsProps = {
  suggestions: CatalogProduct[];
  inCart: string[];
  onAdd: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
};

export function CartSuggestions({ suggestions, inCart, onAdd }: CartSuggestionsProps) {
  const [added, setAdded] = useState<string | null>(null);
  const [holding, setHolding] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<string[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const table = timers.current;
    return () => {
      for (const timer of Object.values(table)) clearTimeout(timer);
    };
  }, []);

  const offer = suggestions
    .filter((product) => product.in_stock && (!inCart.includes(product.id) || holding.includes(product.id)))
    .slice(0, 2);
  if (offer.length === 0) return null;

  const handleAdd = (product: CatalogProduct) => {
    onAdd({
      id: product.id,
      title: product.title,
      price: product.price,
      currency: product.currency,
    });
    setAdded(product.id);
    setHolding((ids) => (ids.includes(product.id) ? ids : [...ids, product.id]));
    if (timers.current[product.id]) clearTimeout(timers.current[product.id]);
    timers.current[product.id] = setTimeout(() => {
      setAdded((current) => (current === product.id ? null : current));
      setLeaving((ids) => (ids.includes(product.id) ? ids : [...ids, product.id]));
    }, 1200);
  };

  const finishLeave = (id: string) => {
    setLeaving((ids) => ids.filter((current) => current !== id));
    setHolding((ids) => ids.filter((current) => current !== id));
  };

  return (
    <section className={styles.also} aria-label="More from the shop">
      <SectionLabel>Cut this morning</SectionLabel>
      <Panel className={styles.alsoPanel}>
        <ul>
          {offer.map((product) => {
            const justAdded = added === product.id;
            const isLeaving = leaving.includes(product.id);
            return (
              <li key={product.id}>
                <div
                  className={collapseStyles.rowCollapse}
                  data-leaving={isLeaving || undefined}
                  onTransitionEnd={(event) => {
                    if (event.propertyName === "grid-template-rows" && isLeaving) finishLeave(product.id);
                  }}
                >
                  <div className={collapseStyles.rowClip}>
                    <div className={styles.alsoRow} data-leaving={isLeaving || undefined}>
                      <Link href={`/product/${product.id}`} className={styles.alsoThumb} aria-hidden tabIndex={-1}>
                        <ProductArt id={product.id} />
                      </Link>
                      <div className={styles.alsoInfo}>
                        <Link href={`/product/${product.id}`} className={styles.alsoTitle}>
                          {product.title}
                        </Link>
                        <Money minor={product.price} currency={product.currency} className={styles.alsoPrice} />
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className={styles.alsoAdd}
                        data-added={justAdded || undefined}
                        disabled={holding.includes(product.id) && !justAdded}
                        onClick={() => handleAdd(product)}
                        aria-label={`Add ${product.title} to cart`}
                      >
                        {justAdded ? (
                          <>
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M5 12.5l4.5 4.5L19 7" />
                            </svg>
                            Added
                          </>
                        ) : "Add"}
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </section>
  );
}
