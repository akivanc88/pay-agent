/** Owns browser cart persistence, normalization, mutation, and subscription events. */

"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The cart, held in the browser.
 *
 * Deliberately client-side and tiny. A UCP checkout session is created from this at the
 * moment the user commits — the merchant is authoritative on price and total, so holding a
 * server cart before then would only invite the two to disagree. What lives here is an
 * intent: which products, how many.
 *
 * Prices are cached alongside for display only. Anything about to be *paid* is read back
 * from the checkout session the store returns, never from this.
 */

const KEY = "pa-cart";
const EVENT = "pa-cart-change";

export interface CartLine {
  id: string;
  title: string;
  price: number; // minor units, display only
  currency: string;
  quantity: number;
}

function read(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable — the cart is session-only, which is acceptable */
  }
  // Same-tab listeners don't get `storage`, so the change is announced explicitly.
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

/**
 * Subscribe to the cart. Returns the lines plus mutators.
 *
 * Starts empty on the server and fills in after mount, so server and client markup agree
 * on the first paint and React does not report a hydration mismatch.
 */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setLines(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    const next = read();
    const existing = next.find((l) => l.id === line.id);
    if (existing) existing.quantity += quantity;
    else next.push({ ...line, quantity });
    write(next);
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    const next = read()
      .map((l) => (l.id === id ? { ...l, quantity } : l))
      .filter((l) => l.quantity > 0);
    write(next);
  }, []);

  const remove = useCallback((id: string) => setQuantity(id, 0), [setQuantity]);
  const clear = useCallback(() => write([]), []);

  return {
    lines,
    ready,
    count: cartCount(lines),
    total: cartTotal(lines),
    add,
    setQuantity,
    remove,
    clear,
  };
}
