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
  return amountOf(session.totals, "total") ?? amountOf(session.totals, "subtotal") ?? 0;
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

      try {
        const completed = await req<Session>(`/checkout-sessions/${due.handle}/complete`, {
          method: "POST",
          body: JSON.stringify({ payment: { instruments } }),
        });
        const orderId = completed.order?.id ?? due.handle;
        // The store settles the whole total and does not break the split out in its response.
        // For a verified closed-loop card the planner already clamped the draw to the ledger
        // balance, so the plan's split is the settled split; confirm() re-verifies the order.
        return {
          ok: true,
          handle: orderId,
          detail: `order ${orderId} completed`,
          giftDrawnMinor: plan.giftDrawMinor > 0 ? plan.giftDrawMinor : null,
          cardChargedMinor: plan.cardMinor > 0 ? plan.cardMinor : null,
          reversed: false,
        };
      } catch (err) {
        if (err instanceof StoreError) {
          // The store already reversed every gift draw and cancelled the card leg before it
          // answered, so nothing is left committed to a checkout that did not complete.
          return {
            ok: false,
            handle: due.handle,
            detail: err.code ? `${err.message} (${err.code})` : err.message,
            giftDrawnMinor: null,
            cardChargedMinor: null,
            reversed: plan.giftDrawMinor > 0,
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
