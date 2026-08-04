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
  const { lines, ready, count, total, setQuantity, remove, add } = useCart();

  /* An empty cart is a whole page of its own, not a panel inside the cart layout — it has
     no summary, no line items, and nothing the cart's heading applies to. */
  if (ready && lines.length === 0) {
    return <EmptyCart suggestions={suggestions} />;
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
            {/*
             * One panel, ruled between rows — not a stack of cards. Nine separate bordered
             * boxes with air between them says "nine unrelated things"; a cart is one list
             * of one order, and the hairline is the only mark needed to say where a line
             * ends.
             */}
            <Panel className={styles.lines}>
              <ul aria-label="Items in your cart">
                {lines.map((line) => (
                  <li key={line.id}>
                    <CartRow line={line} onQuantity={setQuantity} onRemove={remove} />
                  </li>
                ))}
              </ul>
            </Panel>

            <AlsoFromTheShop
              suggestions={suggestions}
              inCart={lines.map((l) => l.id)}
              onAdd={add}
            />
          </div>

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
                    <Money minor={total} currency={currency} />
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

              {/*
               * The total gets its own band rather than a fourth row in the column above.
               * It is the number this page exists to state, so it carries real size — and
               * putting it in a separate ground is what lets it, because a 22px amount
               * sitting in a 15px column would drag the decimal off the column's vertical.
               */}
              <div className={styles.totalBand}>
                <span className={styles.totalLabel}>Estimated total</span>
                <Money minor={total} currency={currency} className={styles.totalAmount} />
              </div>

              <p className={styles.summaryNote}>
                Delivery and taxes are quoted by the shop on the next step, before anything is
                charged. You can pay with a gift card, a card, or both.
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
    <div className={styles.row}>
      <Link href={`/product/${line.id}`} className={styles.thumb} aria-hidden tabIndex={-1}>
        <ProductArt id={line.id} />
      </Link>

      <div className={styles.rowInfo}>
        <Link href={`/product/${line.id}`} className={styles.rowTitle}>
          {line.title}
        </Link>
        <p className={styles.rowMeta}>
          {/* At quantity 1 the unit price is character-for-character the line total, two
              inches away in the same row. It only carries information once there is
              arithmetic to explain. */}
          {line.quantity > 1 && (
            <>
              <span className={styles.rowUnit}>
                <Money minor={line.price} currency={line.currency} /> each
              </span>
              <span className={styles.metaDot} aria-hidden>
                ·
              </span>
            </>
          )}
          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove(line.id)}
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
          disabled={line.quantity <= 1}
          aria-label={`Decrease quantity of ${line.title}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
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
          aria-label={`Increase quantity of ${line.title}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <Money
        minor={line.price * line.quantity}
        currency={line.currency}
        className={styles.rowTotal}
      />
    </div>
  );
}

/* ── the shop, still open ──────────────────────────────────────────────── */
/**
 * A cart with two lines in it leaves a tall column of nothing beside a tall summary. Rather
 * than pad the gap, it is filled with the only thing that honestly belongs there: the rest
 * of the catalogue, at its real price, one press from being in the order.
 *
 * Anything already in the cart is filtered out — offering to add a second copy of the line
 * directly above is the tell that the list is decorative — as is anything out of stock.
 */
function AlsoFromTheShop({
  suggestions,
  inCart,
  onAdd,
}: {
  suggestions: CatalogProduct[];
  inCart: string[];
  onAdd: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
}) {
  const offer = suggestions
    .filter((p) => p.in_stock && !inCart.includes(p.id))
    .slice(0, 2);
  if (offer.length === 0) return null;

  return (
    <section className={styles.also} aria-label="More from the shop">
      <SectionLabel>Cut this morning</SectionLabel>
      <Panel className={styles.alsoPanel}>
        <ul>
          {offer.map((product) => (
            <li key={product.id}>
              <div className={styles.alsoRow}>
                <Link
                  href={`/product/${product.id}`}
                  className={styles.alsoThumb}
                  aria-hidden
                  tabIndex={-1}
                >
                  <ProductArt id={product.id} />
                </Link>
                <div className={styles.alsoInfo}>
                  <Link href={`/product/${product.id}`} className={styles.alsoTitle}>
                    {product.title}
                  </Link>
                  <Money
                    minor={product.price}
                    currency={product.currency}
                    className={styles.alsoPrice}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className={styles.alsoAdd}
                  onClick={() =>
                    onAdd({
                      id: product.id,
                      title: product.title,
                      price: product.price,
                      currency: product.currency,
                    })
                  }
                  aria-label={`Add ${product.title} to cart`}
                >
                  Add
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
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
        /* Bare strokes: the disc behind them is the StatePage's, shared with the 404 and the
           error boundary so all three states are made of the same material. */
        <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          {/* a single stem in a vase */}
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
      <div className={styles.itemsCol}>
        <div className={`${styles.lines} ${styles.linesSkeleton}`}>
          {[0, 1].map((i) => (
            <div key={i} className={`${styles.row} ${styles.rowSkeleton}`}>
              <div className={`${styles.thumb} ${styles.skel}`} />
              <div className={styles.rowInfo}>
                <div className={styles.skelLine} style={{ width: "55%" }} />
                <div className={styles.skelLine} style={{ width: "24%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.summaryCol}>
        <div className={`${styles.summary} ${styles.skel}`} style={{ height: "20rem" }} />
      </div>
    </div>
  );
}
