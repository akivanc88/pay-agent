"use client";

import { useEffect, useRef, useState } from "react";
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
/**
 * Removal is a collapse, not a jump-cut: the row fades and its track folds to nothing over
 * one motion token, and only then does it leave the cart's actual state — a line that just
 * vanished mid-read is what makes a list feel unstable. `prefers-reduced-motion` skips the
 * wait entirely rather than playing the transition invisibly, so a reduced-motion user never
 * sits through a silent 320ms delay on a click that looks like it did nothing.
 */
function CartRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  onQuantity: (id: string, q: number) => void;
  onRemove: (id: string) => void;
}) {
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
      className={styles.rowCollapse}
      data-leaving={leaving || undefined}
      onTransitionEnd={(e) => {
        if (e.propertyName === "grid-template-rows" && leaving) finishRemove();
      }}
    >
      <div className={styles.rowClip}>
        <div className={styles.row} aria-busy={leaving || undefined}>
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
            {/* Keyed on quantity: a fresh node per value gives the tick a mount to animate
                without any extra state, and `aria-live` on the wrapper still announces once. */}
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
  /*
   * A transient confirmation, not a toast — but a row that vanishes from under a "just
   * added" label the instant it is pressed shows the confirmation to no one. `holding` keeps
   * an added item in the list a moment after `inCart` already disqualifies it, so "Added"
   * has something to sit on screen next to before the row hands its slot to the next
   * suggestion — the same collapse the cart's own line items use on removal, reused here
   * for the same reason: a row this list drops should fold shut, not blink out.
   */
  const [added, setAdded] = useState<string | null>(null);
  const [holding, setHolding] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<string[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const table = timers.current;
    return () => {
      for (const t of Object.values(table)) clearTimeout(t);
    };
  }, []);

  const offer = suggestions
    .filter((p) => p.in_stock && (!inCart.includes(p.id) || holding.includes(p.id)))
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
      setAdded((cur) => (cur === product.id ? null : cur));
      setLeaving((ids) => (ids.includes(product.id) ? ids : [...ids, product.id]));
    }, 1200);
  };

  const finishLeave = (id: string) => {
    setLeaving((ids) => ids.filter((x) => x !== id));
    setHolding((ids) => ids.filter((x) => x !== id));
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
                  className={styles.rowCollapse}
                  data-leaving={isLeaving || undefined}
                  onTransitionEnd={(e) => {
                    if (e.propertyName === "grid-template-rows" && isLeaving) finishLeave(product.id);
                  }}
                >
                  <div className={styles.rowClip}>
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
                        ) : (
                          "Add"
                        )}
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
