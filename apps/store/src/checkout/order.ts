/** Coordinates inventory reservations and constructs durable checkout orders. */

import { v4 as uuidv4 } from "uuid";

import {
  getProduct,
  releaseStock,
  reserveStock,
} from "../data";
import type {
  Expectation,
  ExpectationLineItem,
  ExtendedCheckoutResponse,
  FulfillmentDestinationResponse,
  FulfillmentOption,
  LineItemResponse,
  Order,
  OrderLineItem,
  PostalAddress,
} from "../models";

export class InventoryReservation {
  private reserved: Array<{ id: string; quantity: number }> = [];
  private closed = false;

  reserve(checkout: ExtendedCheckoutResponse): string | undefined {
    for (const line of checkout.line_items) {
      if (!getProduct(line.item.id)) continue;
      if (!reserveStock(line.item.id, line.quantity)) {
        this.release();
        return line.item.id;
      }
      this.reserved.push({ id: line.item.id, quantity: line.quantity });
    }
    return undefined;
  }

  release(): void {
    if (this.closed) return;
    for (const item of this.reserved) releaseStock(item.id, item.quantity);
    this.reserved = [];
    this.closed = true;
  }

  commit(): void {
    this.reserved = [];
    this.closed = true;
  }
}

function buildExpectations(checkout: ExtendedCheckoutResponse): Expectation[] {
  const expectations: Expectation[] = [];
  for (const method of checkout.fulfillment?.methods ?? []) {
    let destination: PostalAddress = {};
    if (method.selected_destination_id && method.destinations) {
      const selectedDestination = method.destinations.find(
        (candidate: FulfillmentDestinationResponse) =>
          candidate.id === method.selected_destination_id,
      );
      if (selectedDestination) {
        destination = selectedDestination.address ?? selectedDestination;
      }
    }

    for (const group of method.groups ?? []) {
      const option = group.options?.find(
        (candidate: FulfillmentOption) =>
          candidate.id === group.selected_option_id,
      );
      if (!option) continue;

      const lineItems: ExpectationLineItem[] = [];
      for (const lineItemId of group.line_item_ids ?? []) {
        const checkoutLineItem = checkout.line_items.find(
          (lineItem) => lineItem.id === lineItemId,
        );
        if (checkoutLineItem) {
          lineItems.push({
            id: checkoutLineItem.id,
            quantity: checkoutLineItem.quantity,
          });
        }
      }

      expectations.push({
        id: `exp_${uuidv4()}`,
        destination,
        method_type: method.type,
        line_items: lineItems,
        description: option.title,
      });
    }
  }
  return expectations;
}

export function constructOrder(checkout: ExtendedCheckoutResponse): Order {
  const orderId = `ord_${uuidv4()}`;
  const lineItems: OrderLineItem[] = checkout.line_items.map(
    (lineItem: LineItemResponse) => ({
      id: lineItem.id,
      item: lineItem.item,
      quantity: { total: lineItem.quantity, fulfilled: 0 },
      totals: lineItem.totals,
      status: "processing",
      parent_id: lineItem.parent_id,
    }),
  );

  return {
    ucp: checkout.ucp,
    id: orderId,
    checkout_id: checkout.id,
    permalink_url: `http://localhost:8080/orders/${orderId}`,
    line_items: lineItems,
    totals: checkout.totals,
    fulfillment: { expectations: buildExpectations(checkout) },
    currency: checkout.currency,
  };
}

export function recordShipment(order: Order): void {
  order.fulfillment.events ??= [];
  order.fulfillment.events.push({
    id: `evt_${uuidv4()}`,
    type: "shipped",
    occurred_at: new Date(),
    line_items: [],
  });
}
