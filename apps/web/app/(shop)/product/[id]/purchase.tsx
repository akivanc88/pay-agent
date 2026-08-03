"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, Money } from "@/components/ui";
import { useCart } from "@/lib/cart";
import styles from "./page.module.css";

/**
 * The one interactive island on the product page: choose a quantity, add it to the shared
 * cart. Everything else on the page is static server markup. Quantity is bounded by the
 * stock the store reported, and the confirmation is announced politely for screen readers.
 */
export function ProductPurchase({
  id,
  title,
  price,
  currency,
  stock,
  inStock,
}: {
  id: string;
  title: string;
  price: number;
  currency: string;
  stock: number;
  inStock: boolean;
}) {
  const { add, ready } = useCart();
  const max = Math.max(1, stock);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(0);

  if (!inStock) {
    return (
      <div className={styles.buy}>
        <Button variant="secondary" size="lg" full disabled>
          Sold out
        </Button>
        <p className={styles.soldOutNote} role="status">
          This arrangement is out of stock right now. We cut small batches — check back in a
          day or two, or browse what&rsquo;s fresh today.
        </p>
        <Link href="/" className={styles.textLink}>
          Browse the shop
        </Link>
      </div>
    );
  }

  function addToCart() {
    add({ id, title, price, currency }, qty);
    setAdded(qty);
  }

  return (
    <div className={styles.buy}>
      <div className={styles.buyRow}>
        <div className={styles.stepper} role="group" aria-label="Quantity">
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14" />
            </svg>
          </button>
          <span className={`${styles.stepValue} tnum`} aria-hidden>
            {qty}
          </span>
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => setQty((q) => Math.min(max, q + 1))}
            disabled={qty >= max}
            aria-label="Increase quantity"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <Button size="lg" className={styles.addBtn} onClick={addToCart} disabled={!ready}>
          <span>Add to cart</span>
          <span className={styles.addDot} aria-hidden>
            ·
          </span>
          <Money minor={price * qty} currency={currency} />
        </Button>
      </div>

      <p className={styles.stockLine}>
        {stock <= 5 ? (
          <>
            <span className={styles.stockDot} data-low aria-hidden />
            Only {stock} left — cut fresh this morning.
          </>
        ) : (
          <>
            <span className={styles.stockDot} aria-hidden />
            In stock · cut fresh and ready to arrange.
          </>
        )}
      </p>

      <p className={styles.added} role="status" aria-live="polite">
        {added > 0 && (
          <>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Added {added} to your cart.
            <Link href="/cart" className={styles.textLink}>
              View cart
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
