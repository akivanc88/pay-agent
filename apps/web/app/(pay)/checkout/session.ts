/**
 * The checkout surface's door onto the UCP merchant.
 *
 * Everything here runs in the browser and goes through the `/api/store/*` rewrite, so there
 * is one origin and no CORS surface. `lib/store.ts` is the server-side counterpart; the two
 * deliberately don't share a client, because the browser needs the mutating half of the
 * protocol (create → update fulfillment → complete) and a server component never does.
 *
 * Money is integer minor units at every boundary. Nothing in this file divides by 100.
 */

import type { CartLine } from "@/lib/cart";

const API = "/api/store";

/* ── the shapes the store actually returns ─────────────────────────────── */

export interface Total {
  type: string;
  amount: number; // minor units
  display_text?: string;
}

export interface SessionLineItem {
  id: string;
  quantity: number;
  item: { id: string; title: string; price: number; image_url?: string | null };
  totals: Total[];
}

/** A postal destination. The store echoes back whatever it was given, plus an `id`. */
export interface Destination {
  id: string;
  first_name?: string;
  last_name?: string;
  street_address?: string;
  address_locality?: string;
  address_region?: string;
  postal_code?: string;
  address_country?: string;
}

export interface ShippingOption {
  id: string;
  title: string;
  description?: string;
  totals: Total[];
}

export interface FulfillmentGroup {
  id: string;
  line_item_ids: string[];
  options?: ShippingOption[];
  selected_option_id?: string | null;
}

export interface FulfillmentMethod {
  id: string;
  type: string;
  line_item_ids: string[];
  destinations?: Destination[];
  selected_destination_id?: string | null;
  groups?: FulfillmentGroup[];
}

export interface Session {
  id: string;
  status: string;
  currency: string;
  line_items: SessionLineItem[];
  totals: Total[];
  fulfillment?: { methods?: FulfillmentMethod[] };
  order?: { id: string; permalink_url?: string };
}

/** What the store sends back when a checkout cannot be completed. */
export interface StoreError {
  detail: string;
  /** The issuer's own reason (`insufficient_funds`, …) when there is one. */
  code?: string;
  status: number;
}

/* ── reading a session ─────────────────────────────────────────────────── */

function amountOf(totals: Total[] | undefined, type: string): number | undefined {
  return totals?.find((t) => t.type === type)?.amount;
}

/** The authoritative amount due. The merchant owns this number, not the cart. */
export function totalOf(session: Session): number {
  return amountOf(session.totals, "total") ?? amountOf(session.totals, "subtotal") ?? 0;
}

export function subtotalOf(session: Session): number {
  return amountOf(session.totals, "subtotal") ?? 0;
}

/** The chosen delivery charge, once one has been chosen. `undefined` means "not yet". */
export function deliveryOf(session: Session): Total | undefined {
  return session.totals.find((t) => t.type === "fulfillment");
}

export function shippingMethodOf(session: Session): FulfillmentMethod | undefined {
  return session.fulfillment?.methods?.find((m) => m.type === "shipping");
}

export function shippingGroupOf(session: Session): FulfillmentGroup | undefined {
  return shippingMethodOf(session)?.groups?.[0];
}

export function selectedDestinationOf(session: Session): Destination | undefined {
  const method = shippingMethodOf(session);
  if (!method?.selected_destination_id) return undefined;
  return method.destinations?.find((d) => d.id === method.selected_destination_id);
}

export function optionAmount(option: ShippingOption): number {
  return amountOf(option.totals, "total") ?? 0;
}

/**
 * Whether the store will accept a `complete` for this session.
 *
 * Mirrors `completeCheckout`'s own precondition exactly — a destination *and* an option on
 * every group — so the button is disabled for the same reason the API would have refused.
 */
export function fulfillmentIsComplete(session: Session): boolean {
  const methods = session.fulfillment?.methods;
  if (!methods || methods.length === 0) return false;
  return methods.every(
    (m) => Boolean(m.selected_destination_id) && Boolean(m.groups?.every((g) => g.selected_option_id)),
  );
}

/* ── driving a session ─────────────────────────────────────────────────── */

class RequestFailed extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new RequestFailed("The storefront could not be reached.", 0);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text };
  }

  if (!res.ok) {
    const detail =
      (body as { detail?: string }).detail ?? `The storefront responded ${res.status}.`;
    throw new RequestFailed(detail, res.status);
  }
  return body as T;
}

/** The line-items payload. Every `PUT` has to resend them; the store rebuilds from these. */
function lineItemsPayload(session: Session) {
  return session.line_items.map((l) => ({
    id: l.id,
    item: { id: l.item.id },
    quantity: l.quantity,
  }));
}

/**
 * Open a checkout.
 *
 * The buyer's email goes in at creation because the store keys its saved destinations off
 * it — asking for shipping with a known buyer returns their addresses in the same response,
 * which is one round trip instead of two.
 */
export async function createSession(lines: CartLine[], email: string): Promise<Session> {
  return send<Session>("/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({
      line_items: lines.map((l) => ({ item: { id: l.id }, quantity: l.quantity })),
      buyer: { email },
      fulfillment: { methods: [{ type: "shipping" }] },
    }),
  });
}

/** Re-read saved destinations for a different buyer email. */
export async function setBuyer(session: Session, email: string): Promise<Session> {
  return send<Session>(`/checkout-sessions/${session.id}`, {
    method: "PUT",
    body: JSON.stringify({
      line_items: lineItemsPayload(session),
      buyer: { email },
      fulfillment: { methods: [{ type: "shipping" }] },
    }),
  });
}

/**
 * Choose where it goes.
 *
 * The store only quotes delivery options once a destination is selected — the price depends
 * on the country — so this is the call that makes the options appear.
 */
export async function selectDestination(
  session: Session,
  email: string,
  destination: Destination,
): Promise<Session> {
  const existing = shippingMethodOf(session)?.destinations ?? [];
  const merged = existing.some((d) => d.id === destination.id)
    ? existing.map((d) => (d.id === destination.id ? destination : d))
    : [...existing, destination];

  return send<Session>(`/checkout-sessions/${session.id}`, {
    method: "PUT",
    body: JSON.stringify({
      line_items: lineItemsPayload(session),
      buyer: { email },
      fulfillment: {
        methods: [
          {
            type: "shipping",
            destinations: merged,
            selected_destination_id: destination.id,
          },
        ],
      },
    }),
  });
}

/** Choose how fast. This is the call that settles the final total. */
export async function selectShippingOption(
  session: Session,
  email: string,
  optionId: string,
): Promise<Session> {
  const method = shippingMethodOf(session);
  const group = method?.groups?.[0];
  if (!method || !group) throw new RequestFailed("No delivery options are available yet.", 0);

  return send<Session>(`/checkout-sessions/${session.id}`, {
    method: "PUT",
    body: JSON.stringify({
      line_items: lineItemsPayload(session),
      buyer: { email },
      fulfillment: {
        methods: [
          {
            type: "shipping",
            destinations: method.destinations ?? [],
            selected_destination_id: method.selected_destination_id,
            groups: [
              {
                id: group.id,
                line_item_ids: group.line_item_ids,
                selected_option_id: optionId,
              },
            ],
          },
        ],
      },
    }),
  });
}

/* ── payment ───────────────────────────────────────────────────────────── */

export interface Instrument {
  id: string;
  type: string;
  handler_id: string;
  credential: Record<string, string>;
}

/**
 * Build the `instruments[]` array.
 *
 * The gift card carries **no `amount`**: it is submitted open-amount, and the merchant draws
 * up to whatever the card actually holds. That is what makes it combinable — a card with
 * nothing left contributes $0.00 and settlement carries on to the next instrument rather
 * than failing. The card rail is authorized for the remainder the gift cards could not
 * cover, which the merchant works out; we never send it an amount either.
 */
export function buildInstruments(
  gift: { code: string; pin: string } | null,
  cardToken: string | null,
): Instrument[] {
  const instruments: Instrument[] = [];
  if (gift) {
    instruments.push({
      id: "gift_card_1",
      type: "gift_card",
      handler_id: "gift_card",
      credential: { type: "gift_card", code: gift.code, pin: gift.pin },
    });
  }
  if (cardToken) {
    instruments.push({
      id: "card_1",
      type: "card",
      handler_id: "stripe_payments",
      credential: { type: "card", token: cardToken },
    });
  }
  return instruments;
}

export type CompleteResult =
  | { ok: true; session: Session }
  | { ok: false; error: StoreError };

/**
 * Pay.
 *
 * A decline is a result, not an exception: the store hands every gift-card draw back and
 * reports the issuer's own reason, and this surface has to render that faithfully rather
 * than as "something went wrong".
 */
export async function completeSession(
  session: Session,
  instruments: Instrument[],
): Promise<CompleteResult> {
  try {
    const completed = await send<Session>(`/checkout-sessions/${session.id}/complete`, {
      method: "POST",
      body: JSON.stringify({ payment: { instruments } }),
    });
    return { ok: true, session: completed };
  } catch (err) {
    if (err instanceof RequestFailed) {
      return { ok: false, error: { detail: err.message, status: err.status } };
    }
    throw err;
  }
}

/**
 * `completeSession` loses the store's `code` field because `send` only keeps `detail`.
 * Payment is the one call where the issuer's code matters, so it is read here directly.
 */
export async function pay(
  session: Session,
  instruments: Instrument[],
): Promise<CompleteResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/checkout-sessions/${session.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment: { instruments } }),
    });
  } catch {
    return {
      ok: false,
      error: { detail: "The storefront could not be reached, so no payment was attempted.", status: 0 },
    };
  }

  const text = await res.text();
  let body: { detail?: string; code?: string } & Partial<Session>;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        detail: body.detail ?? `The storefront responded ${res.status}.`,
        code: body.code,
        status: res.status,
      },
    };
  }
  return { ok: true, session: body as Session };
}

/* ── funding ───────────────────────────────────────────────────────────── */

export interface FundingCard {
  family: "open_loop" | "closed_loop";
  id: string;
  brand?: string;
  last4: string;
  exp?: string;
  balance_display: string;
  balance_verified: boolean;
  balance_stale: boolean;
}

export async function fetchFundingCards(): Promise<FundingCard[]> {
  const body = await send<{ cards: FundingCard[] }>("/funding/cards", { method: "GET" });
  return body.cards;
}

/**
 * Reading a formatted balance back into minor units is shared with the wallet, so it lives
 * in `lib/money.ts` alongside the formatting it inverts. Re-exported here because the
 * funding plan below is its main caller.
 */
export { minorFromDisplay } from "@/lib/money";

/**
 * Find the enrolled gift card a typed code refers to, by its last four.
 *
 * Codes are hashed one-way in the ledger, so the browser cannot look one up — the last four
 * is the only part that is ever recoverable, and it is what the funding list reports. An
 * ambiguous match (two cards ending the same) resolves to nothing, because guessing which
 * one the buyer meant would put a number on screen that might not be theirs.
 */
export function matchGiftCard(code: string, cards: FundingCard[]): FundingCard | null {
  const normalised = code.replace(/[\s-]/g, "").toUpperCase();
  if (normalised.length < 4) return null;
  const last4 = normalised.slice(-4);
  const matches = cards.filter((c) => c.family === "closed_loop" && c.last4 === last4);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/* ── the card rail ─────────────────────────────────────────────────────── */

/**
 * Stripe's own published test PaymentMethods.
 *
 * These are real objects on the real Stripe API in test mode: the storefront authorizes and
 * captures against them for genuine amounts and gets genuine decline codes back. What is
 * simulated is Stripe's test *issuer*, not this integration — which is why the surface says
 * "test mode" rather than implying a live card.
 *
 * Enrolled prepaid cards are not offered here: `GET /funding/cards` deliberately reports
 * only a brand, an expiry and four digits, so the browser has no PaymentMethod id to present
 * for one.
 */
export interface TestCard {
  token: string;
  brand: string;
  last4: string;
  /** What Stripe's test issuer does with it — stated so nothing here looks like a surprise. */
  outcome: string;
  /**
   * The decline code Stripe returns, kept separate from the prose so the UI can set it as a
   * code rather than dropping raw snake_case into a sentence. Absent when the card approves.
   */
  code?: string;
  declines: boolean;
}

export const TEST_CARDS: TestCard[] = [
  { token: "pm_card_visa", brand: "Visa", last4: "4242", outcome: "Authorizes", declines: false },
  {
    token: "pm_card_chargeDeclinedInsufficientFunds",
    brand: "Visa",
    last4: "9995",
    outcome: "Declines",
    code: "insufficient_funds",
    declines: true,
  },
  {
    token: "pm_card_chargeDeclined",
    brand: "Visa",
    last4: "0002",
    outcome: "Declines",
    code: "card_declined",
    declines: true,
  },
];

/* ── the funding plan ──────────────────────────────────────────────────── */

/**
 * How the amount due will be met, worked out the way the merchant works it out.
 *
 * Every field is minor units or `null`. `null` means *not known* — a gift card whose balance
 * the ledger can't confirm has an unknown draw, and the surface must render that as unknown
 * rather than as a number. The whole project's argument is that it does not invent amounts.
 */
export interface FundingPlan {
  due: number;
  /** Minor units drawn from the gift card, or `null` when the balance isn't known. */
  giftDraw: number | null;
  /** Minor units left for the card rail, or `null` when the gift draw isn't known. */
  cardAmount: number | null;
  /** What no instrument covers. Non-zero means this payment cannot succeed as configured. */
  uncovered: number | null;
  hasGift: boolean;
  hasCard: boolean;
}

export function buildPlan(args: {
  due: number;
  giftBalance: number | null;
  hasGift: boolean;
  hasCard: boolean;
}): FundingPlan {
  const { due, giftBalance, hasGift, hasCard } = args;

  if (!hasGift) {
    return {
      due,
      giftDraw: null,
      cardAmount: hasCard ? due : null,
      uncovered: hasCard ? 0 : due,
      hasGift: false,
      hasCard,
    };
  }

  if (giftBalance === null) {
    // A card is presented, so whatever the gift card leaves is covered — but neither split
    // is knowable until the merchant draws.
    return { due, giftDraw: null, cardAmount: null, uncovered: hasCard ? 0 : null, hasGift: true, hasCard };
  }

  const giftDraw = Math.min(giftBalance, due);
  const remainder = due - giftDraw;
  return {
    due,
    giftDraw,
    cardAmount: hasCard ? remainder : 0,
    uncovered: hasCard ? 0 : remainder,
    hasGift: true,
    hasCard,
  };
}

/** True when the plan is knowably short — the one case worth refusing before we ask. */
export function planFallsShort(plan: FundingPlan): boolean {
  return plan.uncovered !== null && plan.uncovered > 0;
}
