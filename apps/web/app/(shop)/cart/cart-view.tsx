"use client";

import Link from "next/link";

import { Button, Money, Panel, SectionLabel } from "@/components/ui";
import { ProductArt } from "@/components/product-art";
import { ProductCard } from "@/components/product-card";
import { StatePage } from "@/components/state-page";
import type { CatalogProduct } from "@/lib/store";
import { useCart, type CartLine } from "@/lib/cart";
import styles from "./page.module.css";

/**
 * The cart, as the browser sees it.
 *
 * Cart state lives in `localStorage`, so this half has to be a client component. It takes
 * `suggestions` as a prop rather than fetching them, because the catalogue is the server's
 * to read — see `page.tsx`, which is the server half.
 */
export function CartView({ suggestions }: { suggestions: CatalogProduct[] }) {
  const { lines, ready, count, total, setQuantity, remove } = useCart();

  /* An empty cart is a whole page of its own, not a panel inside the cart layout — it has
     no summary, no line items, and nothing the cart's heading applies to. */
  if (ready && lines.length === 0) {
    return <EmptyCart suggestions={suggestions} />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <SectionLabel>Fernbank &amp; Co · Florist</SectionLabel>
        <h1 className={styles.title}>Your cart</h1>
        {ready && count > 0 && (
          <p className={styles.count}>
            {count} {count === 1 ? "item" : "items"} ready to go
          </p>
        )}
      </div>

      {!ready ? (
        <CartSkeleton />
      ) : (
        <div className={styles.layout}>
          <ul className={styles.lines} aria-label="Items in your cart">
            {lines.map((line) => (
              <li key={line.id}>
                <CartRow line={line} onQuantity={setQuantity} onRemove={remove} />
              </li>
            ))}
          </ul>

          <aside className={styles.summaryCol} aria-label="Order summary">
            <Panel className={styles.summary}>
              <h2 className={styles.summaryTitle}>Order summary</h2>

              <dl className={styles.summaryRows} aria-live="polite">
                <div className={styles.summaryRow}>
                  <dt>
                    Subtotal
                    <span className={styles.summaryHint}>
                      {count} {count === 1 ? "item" : "items"}
                    </span>
                  </dt>
                  <dd>
                    <Money minor={total} currency={lines[0].currency} />
                  </dd>
                </div>
                <div className={styles.summaryRow} data-muted>
                  <dt>Delivery</dt>
                  <dd>Calculated at checkout</dd>
                </div>
                <div className={styles.summaryRow} data-muted>
                  <dt>Taxes</dt>
                  <dd>Calculated at checkout</dd>
                </div>
              </dl>

              <div className={styles.summaryTotal}>
                <span>Estimated total</span>
                <Money minor={total} currency={lines[0].currency} className={styles.totalAmount} />
              </div>
              <p className={styles.summaryNote}>
                The merchant is authoritative on the final total — delivery and taxes are
                confirmed on the next step, before any payment is taken.
              </p>

              <Button href="/checkout" size="lg" full className={styles.checkoutBtn}>
                Continue to checkout
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Button>
              <Link href="/" className={styles.continueLink}>
                Continue shopping
              </Link>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ── one line item ─────────────────────────────────────────────────────── */
function CartRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  onQuantity: (id: string, q: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Panel className={styles.row}>
      <Link href={`/product/${line.id}`} className={styles.thumb} aria-hidden tabIndex={-1}>
        <ProductArt id={line.id} />
      </Link>

      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <div className={styles.rowInfo}>
            <Link href={`/product/${line.id}`} className={styles.rowTitle}>
              {line.title}
            </Link>
            {/* At quantity 1 the unit price is character-for-character the line total, two
                inches away in the same row. It only carries information once there is
                arithmetic to explain. */}
            {line.quantity > 1 && (
              <p className={styles.rowUnit}>
                <Money minor={line.price} currency={line.currency} /> each
              </p>
            )}
          </div>
          <Money
            minor={line.price * line.quantity}
            currency={line.currency}
            className={styles.rowTotal}
          />
        </div>

        <div className={styles.rowControls}>
          <div className={styles.stepper} role="group" aria-label={`Quantity for ${line.title}`}>
            <button
              type="button"
              className={styles.stepBtn}
              onClick={() => onQuantity(line.id, line.quantity - 1)}
              disabled={line.quantity <= 1}
              aria-label="Decrease quantity"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14" />
              </svg>
            </button>
            <span className={`${styles.stepValue} tnum`} aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              className={styles.stepBtn}
              onClick={() => onQuantity(line.id, line.quantity + 1)}
              aria-label="Increase quantity"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove(line.id)}
            aria-label={`Remove ${line.title} from cart`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
            </svg>
            Remove
          </button>
        </div>
      </div>
    </Panel>
  );
}

/* ── designed empty state ──────────────────────────────────────────────── */
/**
 * The copy names "this week's cuttings" and then shows them, rather than describing a shop
 * the visitor has to go and find. It also stops the page being a 1040px box drawn around
 * 480px of text — the suggestions are what fills the space, honestly.
 */
function EmptyCart({ suggestions }: { suggestions: CatalogProduct[] }) {
  return (
    <StatePage
      eyebrow="Your cart"
      title="Your cart is empty"
      body="Nothing tied up yet. Pick something from this week’s cuttings and it’ll gather here, ready to check out with a gift card, a card, or both."
      action={suggestions.length === 0 ? { href: "/", label: "Browse the shop" } : undefined}
      art={
        <svg viewBox="0 0 120 120" fill="none">
          <circle cx="60" cy="60" r="56" fill="var(--surface-2)" />
          {/* a single stem in a vase — quiet, hand-drawn */}
          <path d="M44 66h32l-3 26a4 4 0 0 1-4 3.5H51a4 4 0 0 1-4-3.5L44 66Z" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" strokeLinejoin="round" />
          <path d="M42 66h36" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
          <path d="M60 62V38" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
          <path d="M60 50c-8-1-13-6-14-13 7 0 13 4 14 11M60 46c7-1 12-6 13-12-6 0-12 3-13 10" fill="var(--brand-tint)" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="60" cy="33" r="6" fill="var(--brand-tint)" stroke="var(--brand)" strokeWidth="2" />
        </svg>
      }
    >
      {suggestions.length > 0 && (
        <section className={styles.suggest}>
          <h2 className={styles.suggestTitle}>This week&rsquo;s cuttings</h2>
          <div className={styles.suggestGrid}>
            {suggestions.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </StatePage>
  );
}

/* ── pre-hydration skeleton (matches the server's empty first paint) ────── */
function CartSkeleton() {
  return (
    <div className={styles.layout} aria-hidden>
      <div className={styles.lines}>
        {[0, 1].map((i) => (
          <div key={i} className={`${styles.row} ${styles.rowSkeleton}`}>
            <div className={`${styles.thumb} ${styles.skel}`} />
            <div className={styles.rowBody}>
              <div className={styles.skelLine} style={{ width: "55%" }} />
              <div className={styles.skelLine} style={{ width: "30%" }} />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.summaryCol}>
        <div className={`${styles.summary} ${styles.skel}`} style={{ height: "16rem" }} />
      </div>
    </div>
  );
}
