/** Enriches requested products with authoritative prices, discounts, totals, and stock checks. */

import { v4 as uuidv4 } from "uuid";

import { getInventory, getProduct } from "../data";
import type {
  ExtendedCheckoutResponse,
  FulfillmentDestinationResponse,
  FulfillmentOption,
} from "../models";

export function recalculateTotals(checkout: ExtendedCheckoutResponse): void {
  let grandTotal = 0;

  for (const line of checkout.line_items) {
    const product = getProduct(line.item.id);
    if (!product) throw new Error(`Product ${line.item.id} not found`);
    line.item.price = product.price;
    line.item.title = product.title;
    const lineTotal = product.price * line.quantity;
    line.totals = [
      { type: "subtotal", amount: lineTotal },
      { type: "total", amount: lineTotal },
    ];
    grandTotal += lineTotal;
  }

  checkout.totals = [{ type: "subtotal", amount: grandTotal }];

  for (const method of checkout.fulfillment?.methods ?? []) {
    if (
      method.type !== "shipping" ||
      !method.selected_destination_id ||
      !method.destinations
    ) continue;

    const destination = method.destinations.find(
      (candidate: FulfillmentDestinationResponse) =>
        candidate.id === method.selected_destination_id,
    );
    const country = destination?.address_country ?? destination?.address?.address_country;
    if (!destination || !country) continue;

    const options: FulfillmentOption[] = [];
    if (country === "US") {
      const hasRoses = checkout.line_items.some(
        (lineItem) => lineItem.item.id === "bouquet_roses",
      );
      const standardCost = hasRoses || grandTotal >= 10000 ? 0 : 500;
      options.push(
        {
          id: "std-ship",
          title: standardCost === 0 ? "Free Standard Shipping" : "Standard Shipping",
          description: "Arrives in 5-7 days",
          totals: [
            { type: "subtotal", amount: standardCost },
            { type: "total", amount: standardCost },
          ],
        },
        {
          id: "exp-ship-us",
          title: "Express Shipping (US)",
          description: "Arrives in 2 days",
          totals: [
            { type: "subtotal", amount: 1500 },
            { type: "total", amount: 1500 },
          ],
        },
      );
    } else {
      options.push({
        id: "exp-ship-intl",
        title: "International Express",
        description: "Arrives in 5-10 days",
        totals: [
          { type: "subtotal", amount: 3000 },
          { type: "total", amount: 3000 },
        ],
      });
    }

    if (!method.groups || method.groups.length === 0) {
      method.groups = [{
        id: `group_${uuidv4()}`,
        line_item_ids: method.line_item_ids,
        options,
      }];
    } else {
      for (const group of method.groups) group.options = options;
    }

    for (const group of method.groups) {
      const selected = group.options?.find(
        (option: FulfillmentOption) => option.id === group.selected_option_id,
      );
      const total = selected?.totals.find((entry) => entry.type === "total")?.amount;
      if (selected && total !== undefined) {
        grandTotal += total;
        checkout.totals.push({
          type: "fulfillment",
          amount: total,
          display_text: selected.title,
        });
      }
    }
  }

  checkout.discounts ??= {};
  checkout.discounts.applied = [];
  for (const code of checkout.discounts.codes ?? []) {
    if (typeof code !== "string") continue;
    const normalized = code.toUpperCase();
    let discountAmount = 0;
    let title = "";
    if (normalized === "10OFF") {
      discountAmount = Math.floor(grandTotal * 0.1);
      title = "10% Off";
    } else if (normalized === "WELCOME20") {
      discountAmount = Math.floor(grandTotal * 0.2);
      title = "Welcome 20% Off";
    } else if (normalized === "FIXED500") {
      discountAmount = Math.min(grandTotal, 500);
      title = "$5.00 Off";
    } else continue;

    grandTotal -= discountAmount;
    checkout.discounts.applied.push({
      code,
      title,
      amount: discountAmount,
      allocations: [{ path: "subtotal", amount: discountAmount }],
    });
    checkout.totals.push({ type: "discount", amount: -discountAmount });
  }

  if (checkout.buyer?.consent) {
    for (const [purpose, value] of Object.entries(checkout.buyer.consent)) {
      if (value && typeof value === "object") {
        const consent = value as { description?: string; source?: string };
        if (!consent.description) consent.description = `Consent for ${purpose}`;
        if (!consent.source) consent.source = "platform";
      }
    }
  }

  checkout.totals.push({ type: "total", amount: grandTotal });
}

export function validateInventory(checkout: ExtendedCheckoutResponse): void {
  for (const line of checkout.line_items) {
    const available = getInventory(line.item.id);
    if (available === undefined || available < line.quantity) {
      throw new Error(`Insufficient stock for item ${line.item.id}`);
    }
  }
}
