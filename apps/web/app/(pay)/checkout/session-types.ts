/**
 * Defines the browser checkout contracts and pure selectors used to render merchant state.
 * Missing merchant totals retain the checkout UI's established zero-value fallback policy.
 */

import {
  checkoutSubtotalOf,
  checkoutTotalOf,
  fulfillmentIsComplete,
  shippingOptionAmount,
} from "@pay-agent/protocol";
import type {
  CheckoutLineItem,
  CheckoutSession,
  Destination as ProtocolDestination,
  FulfillmentGroup as ProtocolFulfillmentGroup,
  FulfillmentMethod as ProtocolFulfillmentMethod,
  FundingCard as ProtocolFundingCard,
  PaymentInstrument,
  ShippingOption as ProtocolShippingOption,
  Total as ProtocolTotal,
} from "@pay-agent/protocol";

export type Total = ProtocolTotal;
export type SessionLineItem = CheckoutLineItem;

/** A postal destination. The store echoes back whatever it was given, plus an `id`. */
export type Destination = ProtocolDestination;
export type ShippingOption = ProtocolShippingOption;
export type FulfillmentGroup = ProtocolFulfillmentGroup;
export type FulfillmentMethod = ProtocolFulfillmentMethod;
export type Session = CheckoutSession;
export type Instrument = PaymentInstrument;
export type FundingCard = ProtocolFundingCard;

/** What the store sends back when a checkout cannot be completed. */
export interface StoreError {
  detail: string;
  /** The issuer's own reason (`insufficient_funds`, …) when there is one. */
  code?: string;
  status: number;
}

/** The authoritative amount due. The merchant owns this number, not the cart. */
export function totalOf(session: Session): number {
  return checkoutTotalOf(session) ?? 0;
}

export function subtotalOf(session: Session): number {
  return checkoutSubtotalOf(session) ?? 0;
}

/** The chosen delivery charge, once one has been chosen. `undefined` means "not yet". */
export function deliveryOf(session: Session): Total | undefined {
  return session.totals.find((total) => total.type === "fulfillment");
}

export function shippingMethodOf(session: Session): FulfillmentMethod | undefined {
  return session.fulfillment?.methods?.find((method) => method.type === "shipping");
}

export function shippingGroupOf(session: Session): FulfillmentGroup | undefined {
  return shippingMethodOf(session)?.groups?.[0];
}

export function selectedDestinationOf(session: Session): Destination | undefined {
  const method = shippingMethodOf(session);
  if (!method?.selected_destination_id) return undefined;
  return method.destinations?.find(
    (destination) => destination.id === method.selected_destination_id,
  );
}

export function optionAmount(option: ShippingOption): number {
  return shippingOptionAmount(option) ?? 0;
}

/** Mirrors the merchant completion precondition across all fulfillment methods and groups. */
export { fulfillmentIsComplete };
