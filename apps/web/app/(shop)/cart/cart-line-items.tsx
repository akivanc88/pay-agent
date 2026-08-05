/** Presents editable cart lines and owns each row's removal transition. */

"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import { Money, Panel } from "@/components/ui";
import { ProductArt } from "@/components/product-art";
import type { CartLine } from "@/lib/cart";

import collapseStyles from "./cart-row-collapse.module.css";
import styles from "./cart-line-items.module.css";

type CartLineItemsProps = {
  lines: CartLine[];
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
};

export function CartLineItems({ lines, onQuantity, onRemove }: CartLineItemsProps) {
  return (
    <Panel className={styles.lines}>
      <ul aria-label="Items in your cart">
        {lines.map((line) => (
          <li key={line.id}>
            <CartRow line={line} onQuantity={onQuantity} onRemove={onRemove} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CartRow({ line, onQuantity, onRemove }: Omit<CartLineItemsProps, "lines"> & { line: CartLine }) {
  const [leaving, setLeaving] = useState(false);
  const removedRef = useRef(false);

  const handleRemove = () => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      onRemove(line.id);
      return;
    }
    setLeaving(true);
  };

  const finishRemove = () => {
    if (removedRef.current) return;
    removedRef.current = true;
    onRemove(line.id);
  };

  return (
    <div
      className={collapseStyles.rowCollapse}
      data-leaving={leaving || undefined}
      onTransitionEnd={(event) => {
        if (event.propertyName === "grid-template-rows" && leaving) finishRemove();
      }}
    >
      <div className={collapseStyles.rowClip}>
        <div className={`${styles.row} ${collapseStyles.rowContent}`} aria-busy={leaving || undefined}>
          <Link href={`/product/${line.id}`} className={styles.thumb} aria-hidden tabIndex={-1}>
            <ProductArt id={line.id} />
          </Link>
          <div className={styles.rowInfo}>
            <Link href={`/product/${line.id}`} className={styles.rowTitle}>
              {line.title}
            </Link>
            <p className={styles.rowMeta}>
              {line.quantity > 1 && (
                <>
                  <span className={styles.rowUnit}>
                    <Money minor={line.price} currency={line.currency} /> each
                  </span>
                  <span className={styles.metaDot} aria-hidden>·</span>
                </>
              )}
              <button
                type="button"
                className={styles.remove}
                onClick={handleRemove}
                disabled={leaving}
                aria-label={`Remove ${line.title} from cart`}
              >
                Remove
              </button>
            </p>
          </div>
          <div className={styles.stepper} role="group" aria-label={`Quantity for ${line.title}`}>
            <button
              type="button"
              className={styles.stepBtn}
              onClick={() => onQuantity(line.id, line.quantity - 1)}
              disabled={line.quantity <= 1 || leaving}
              aria-label={`Decrease quantity of ${line.title}`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M5 12h14" />
              </svg>
            </button>
            <span className={styles.stepValueWrap} aria-live="polite">
              <span key={line.quantity} className={`${styles.stepValue} tnum`}>
                {line.quantity}
              </span>
            </span>
            <button
              type="button"
              className={styles.stepBtn}
              onClick={() => onQuantity(line.id, line.quantity + 1)}
              disabled={leaving}
              aria-label={`Increase quantity of ${line.title}`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
          <Money
            key={line.quantity}
            minor={line.price * line.quantity}
            currency={line.currency}
            className={styles.rowTotal}
          />
        </div>
      </div>
    </div>
  );
}
