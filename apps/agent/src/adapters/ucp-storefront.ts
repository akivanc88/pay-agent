/**
 * The UCP storefront adapter — the reference destination, the "everyone did it right" pole.
 *
 * The store speaks UCP agentic checkout: it publishes a machine-readable amount and redeems our
 * closed-loop gift card itself, so discovery is an API call and the split is submitted to the
 * merchant as an `instruments[]` array. This adapter drives that lifecycle over HTTP — the exact
 * flow the human checkout in `apps/web` proves — and normalizes it to `PaymentDestination`, so the
 * planner reaches it with the same four methods it uses for every other destination.
 */
import type {
  AcceptedInstruments,
  AmountDue,
  InstrumentPlan,
  Mandate,
  PaymentDestination,
  PaymentResult,
  PaymentStatus,
} from "../destination.js";
import type { Minor } from "../money.js";

/* The store's wire shapes, narrowed to what this adapter reads. Mirrors apps/web's session.ts. */
interface Total {
  readonly type: string;
  readonly amount: number;
}
interface ShippingOption {
  readonly id: string;
  readonly totals: Total[];
}
interface FulfillmentGroup {
  readonly id: string;
  readonly line_item_ids: string[];
  readonly options?: ShippingOption[];
}
interface FulfillmentMethod {
  readonly id: string;
  readonly type: string;
  readonly destinations?: Array<Record<string, unknown>>;
  readonly selected_destination_id?: string | null;
  readonly groups?: FulfillmentGroup[];
}
interface SessionLineItem {
  readonly id: string;
  readonly item: { id: string };
  readonly quantity: number;
}
interface Session {
  readonly id: string;
  readonly status: string;
  readonly currency: string;
  readonly line_items: SessionLineItem[];
  readonly totals: Total[];
  readonly fulfillment?: { methods?: FulfillmentMethod[] };
  readonly order?: { id: string };
}

/** A postal destination the agent supplies so the store will quote — and settle — a delivery. */
const AGENT_DESTINATION = {
  id: "dest_agent",
  first_name: "Agent",
  last_name: "Runner",
  street_address: "1 Test Way",
  address_locality: "Springfield",
  address_region: "IL",
  postal_code: "62704",
  address_country: "US",
} as const;

const BUYER_EMAIL = "agent@pay-agent.test";

class StoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

function amountOf(totals: Total[] | undefined, type: string): number | undefined {
  return totals?.find((t) => t.type === type)?.amount;
}
/** The authoritative amount due — the merchant owns this number, not the cart. */
function totalOf(session: Session): Minor {
  const total = amountOf(session.totals, "total") ?? amountOf(session.totals, "subtotal");
  // Never fall back to zero: a missing total is a broken quote, not a free cart. Refuse it rather
  // than let the agent proceed to pay $0.
  if (total === undefined) throw new StoreError("The storefront quoted no total for this cart.", 0);
  return total;
}
function shippingMethodOf(session: Session): FulfillmentMethod | undefined {
  return session.fulfillment?.methods?.find((m) => m.type === "shipping");
}
/** Every PUT resends the line items; the store rebuilds from them. */
function lineItemsPayload(session: Session) {
  return session.line_items.map((l) => ({ id: l.id, item: { id: l.item.id }, quantity: l.quantity }));
}

/**
 * A cart descriptor: `"bouquet_roses:1,gardenias:2"`, or a bare product id (quantity 1). This is
 * the `reference` the agent is handed for this destination; a real agent would be given a cart id,
 * but the store builds a session from line items, so we carry them directly.
 */
function parseReference(reference: string): Array<{ id: string; quantity: number }> {
  const lines = reference
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, qty] = part.split(":");
      const quantity = qty ? Number.parseInt(qty, 10) : 1;
      if (!id || !Number.isInteger(quantity) || quantity < 1) {
        throw new Error(`bad cart reference segment: "${part}"`);
      }
      return { id: id.trim(), quantity };
    });
  if (lines.length === 0) throw new Error(`empty cart reference: "${reference}"`);
  return lines;
}

export function ucpStorefront(opts: { baseUrl: string }): PaymentDestination {
  const base = opts.baseUrl.replace(/\/$/, "");

  async function req<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
    } catch {
      throw new StoreError("The storefront could not be reached.", 0);
    }
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { detail: text };
    }
    if (!res.ok) {
      const b = body as { detail?: string; code?: string };
      throw new StoreError(b.detail ?? `The storefront responded ${res.status}.`, res.status, b.code);
    }
    return body as T;
  }

  return {
    id: "ucp-storefront",

    /**
     * Open a checkout, put a destination on it, and choose a shipping option — which is the call
     * that settles the final total — then hand back that total. Mirrors the human flow exactly.
     */
    async discover(reference: string): Promise<AmountDue> {
      const lines = parseReference(reference);

      let session = await req<Session>("/checkout-sessions", {
        method: "POST",
        body: JSON.stringify({
          line_items: lines.map((l) => ({ item: { id: l.id }, quantity: l.quantity })),
          buyer: { email: BUYER_EMAIL },
          fulfillment: { methods: [{ type: "shipping" }] },
        }),
      });

      // Attach and select a destination so the store will quote delivery.
      session = await req<Session>(`/checkout-sessions/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          line_items: lineItemsPayload(session),
          buyer: { email: BUYER_EMAIL },
          fulfillment: {
            methods: [
              {
                type: "shipping",
                destinations: [AGENT_DESTINATION],
                selected_destination_id: AGENT_DESTINATION.id,
              },
            ],
          },
        }),
      });

      // Select the first quoted shipping option — the total is not final until one is chosen.
      const method = shippingMethodOf(session);
      const group = method?.groups?.[0];
      const option = group?.options?.[0];
      if (!method || !group || !option) {
        throw new StoreError("The storefront quoted no delivery options.", 0);
      }
      session = await req<Session>(`/checkout-sessions/${session.id}`, {
        method: "PUT",
        body: JSON.stringify({
          line_items: lineItemsPayload(session),
          buyer: { email: BUYER_EMAIL },
          fulfillment: {
            methods: [
              {
                type: "shipping",
                destinations: method.destinations ?? [AGENT_DESTINATION],
                selected_destination_id: method.selected_destination_id ?? AGENT_DESTINATION.id,
                groups: [
                  { id: group.id, line_item_ids: group.line_item_ids, selected_option_id: option.id },
                ],
              },
            ],
          },
        }),
      });

      return {
        destinationId: this.id,
        reference,
        amountMinor: totalOf(session),
        currency: session.currency,
        description: `storefront cart (${lines.length} line${lines.length > 1 ? "s" : ""})`,
        handle: session.id,
      };
    },

    /** This store issued the closed-loop card and redeems it itself, in the same checkout. */
    async capabilities(): Promise<AcceptedInstruments> {
      return { currency: "CAD", redeemsGiftCard: true, acceptsCard: true };
    },

    /**
     * Complete the checkout with the planned instruments. The gift card goes in open-amount (no
     * amount field — the merchant draws up to what it holds); the card rail takes the remainder.
     * The store owns the ledger, so on any failure it reverses its own gift draws and cancels the
     * card authorization before it answers — a decline arrives already unwound.
     */
    async pay(plan: InstrumentPlan, _mandate: Mandate, due: AmountDue): Promise<PaymentResult> {
      const instruments: Array<Record<string, unknown>> = [];
      if (plan.giftDrawMinor > 0 && plan.giftCard) {
        instruments.push({
          id: "gift_card_1",
          type: "gift_card",
          handler_id: "gift_card",
          credential: { type: "gift_card", code: plan.giftCard.code, pin: plan.giftCard.pin },
        });
      }
      if (plan.cardMinor > 0 && plan.card) {
        instruments.push({
          id: "card_1",
          type: "card",
          handler_id: "stripe_payments",
          credential: { type: "card", token: plan.card.token },
        });
      }

      // An idempotency key so an *intended* single completion is recorded once. But this store
      // writes that record only at the end of its handler and never reserves the key at the start,
      // so a blind retry could re-execute a completion still in flight and draw/charge twice.
      // Therefore an ambiguous outcome is resolved by READING the order — a GET can never settle
      // anything — not by re-POSTing.
      const idemKey = `complete:${due.handle}`;

      /** The order id if this session has completed, else null. Read-only; safe to call anytime. */
      const settledOrderId = async (): Promise<string | null> => {
        try {
          const s = await req<Session>(`/checkout-sessions/${due.handle}`, { method: "GET" });
          return s.order?.id ?? null;
        } catch {
          return null;
        }
      };

      try {
        const completed = await req<Session>(`/checkout-sessions/${due.handle}/complete`, {
          method: "POST",
          headers: { "Idempotency-Key": idemKey },
          body: JSON.stringify({ payment: { instruments } }),
        });
        const orderId = completed.order?.id ?? due.handle;
        // The store settles the whole total, draws the gift card open-amount against its *live*
        // ledger balance, and returns no per-instrument breakdown — so we do not assert a split we
        // cannot see. The order's existence is the settlement fact; confirm() re-verifies it.
        return {
          ok: true,
          handle: orderId,
          detail: `order ${orderId} completed`,
          giftDrawnMinor: null,
          cardChargedMinor: null,
          reversed: false,
        };
      } catch (err) {
        if (err instanceof StoreError) {
          // Ambiguous outcomes — a lost response (0), a conflict that may mean "already done"
          // (409), or a server error (5xx) whose compensation we cannot see — are resolved by
          // reading the order, never by re-completing, and never by asserting a reversal we did not
          // observe. (The store's own catch-all reverses a drawn gift on a 500, but from here that
          // is unverified, so we report indeterminate rather than claim it.)
          if (err.status === 0 || err.status === 409 || err.status >= 500) {
            const orderId = await settledOrderId();
            if (orderId) {
              return {
                ok: true,
                handle: orderId,
                detail: `order ${orderId} confirmed by read after an ambiguous response`,
                giftDrawnMinor: null,
                cardChargedMinor: null,
                reversed: false,
              };
            }
            return {
              ok: false,
              handle: due.handle,
              detail:
                `indeterminate: no order confirmed for session ${due.handle}; verify before ` +
                `retrying — a blind retry against this store is not safe`,
              giftDrawnMinor: null,
              cardChargedMinor: null,
              reversed: false,
            };
          }
          // A definite store failure (a 402 decline, a 400). The store's failPayment reverses any
          // draw it made internally before answering — but that reversal is the store's own,
          // best-effort, and invisible from here. This adapter drew no gift itself (the store does
          // it inside /complete) and observed no reversal, so it does not assert one: `reversed` is
          // false, meaning "not observed-reversed by us," never inferred from the fact that a draw
          // was planned. Claiming reversed:true off `plan.giftDrawMinor` would be a fact we can't see.
          return {
            ok: false,
            handle: due.handle,
            detail: err.code ? `${err.message} (${err.code})` : err.message,
            giftDrawnMinor: null,
            cardChargedMinor: null,
            reversed: false,
          };
        }
        throw err;
      }
    },

    /** Ask the store what became of it: an order exists only if the payment settled. */
    async confirm(handle: string): Promise<PaymentStatus> {
      try {
        await req<{ id: string }>(`/orders/${handle}`, { method: "GET" });
        return { settled: true, handle, detail: `order ${handle} exists` };
      } catch (err) {
        const detail = err instanceof StoreError ? err.message : "order lookup failed";
        return { settled: false, handle, detail };
      }
    },
  };
}
