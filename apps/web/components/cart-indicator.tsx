"use client";

import Link from "next/link";

import { useCart } from "@/lib/cart";
import styles from "./cart-indicator.module.css";

/**
 * The header's cart affordance: a bag icon with a live count. Client-only, driven by the
 * shared `useCart()`. The count is withheld until `ready` so server and first client paint
 * agree — no hydration mismatch — and the label always states the real count for
 * assistive tech.
 */
export function CartIndicator() {
  const { count, ready } = useCart();
  const show = ready && count > 0;
  const label = show
    ? `Cart, ${count} ${count === 1 ? "item" : "items"}`
    : "Cart, empty";

  return (
    <Link href="/cart" className={styles.link} aria-label={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {/* A shopping bag: squared body, handle standing clear of the rim so it never
            reads as the trash icon used for "Remove" on the cart. */}
        <path d="M5.5 8.5h13l-1 11a1.6 1.6 0 0 1-1.6 1.5H8.1a1.6 1.6 0 0 1-1.6-1.5l-1-11Z" />
        <path d="M9 8.5V6.6a3 3 0 0 1 6 0v1.9" />
      </svg>
      {show && (
        /* Keyed on the count so React replaces the node rather than mutating it, which is
           what re-triggers the arrival animation on every change. */
        <span key={count} className={`${styles.count} tnum`} aria-hidden>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
