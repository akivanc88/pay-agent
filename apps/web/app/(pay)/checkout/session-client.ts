/**
 * Drives browser checkout mutations through the same-origin `/api/store` rewrite.
 * Transport failures retain status, detail, and issuer code without owning retry policy.
 */

import type { CartLine } from "@/lib/cart";
import {
  createJsonClient,
  lineItemsPayload,
  ProtocolHttpError,
} from "@pay-agent/protocol";

import { shippingMethodOf } from "./session-types";
import type {
  Destination,
  FundingCard,
  Instrument,
  Session,
  StoreError,
} from "./session-types";

const send = createJsonClient({
  baseUrl: "/api/store",
  responseLabel: "storefront",
  unreachableMessage: "The storefront could not be reached.",
});

/** Open a checkout with buyer identity so saved destinations arrive in the first response. */
export async function createSession(lines: CartLine[], email: string): Promise<Session> {
  return send<Session>("/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({
      line_items: lines.map((line) => ({ item: { id: line.id }, quantity: line.quantity })),
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

/** Select a postal destination, prompting the merchant to quote delivery options. */
export async function selectDestination(
  session: Session,
  email: string,
  destination: Destination,
): Promise<Session> {
  const existing = shippingMethodOf(session)?.destinations ?? [];
  const merged = existing.some((candidate) => candidate.id === destination.id)
    ? existing.map((candidate) => (candidate.id === destination.id ? destination : candidate))
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

/** Choose how fast; this mutation settles the merchant-authoritative final total. */
export async function selectShippingOption(
  session: Session,
  email: string,
  optionId: string,
): Promise<Session> {
  const method = shippingMethodOf(session);
  const group = method?.groups?.[0];
  if (!method || !group) {
    throw new ProtocolHttpError("No delivery options are available yet.", 0);
  }

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

export type CompleteResult =
  | { ok: true; session: Session }
  | { ok: false; error: StoreError };

/** Complete payment, returning definite merchant declines as renderable results. */
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
  } catch (error) {
    if (error instanceof ProtocolHttpError) {
      return {
        ok: false,
        error: {
          detail: error.detail,
          status: error.status,
          ...(error.code ? { code: error.code } : {}),
        },
      };
    }
    throw error;
  }
}

/** Compatibility name for the same code-preserving completion implementation. */
export const pay = completeSession;

export async function fetchFundingCards(): Promise<FundingCard[]> {
  const body = await send<{ cards: FundingCard[] }>("/funding/cards", { method: "GET" });
  return body.cards;
}
