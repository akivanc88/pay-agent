/**
 * Browser-safe wire contracts shared by protocol producers and consumers.
 * These types intentionally describe only fields this workspace reads or writes.
 */

export interface Total {
  type: string;
  amount: number;
  display_text?: string;
}

export interface CatalogProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  image_url: string | null;
  in_stock: boolean;
  stock: number;
}

export interface Catalog {
  currency: string;
  products: CatalogProduct[];
}

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

export interface FundingCardsResponse {
  cards: FundingCard[];
}

/** A postal destination as accepted and echoed by UCP checkout. */
export interface Destination {
  id: string;
  first_name?: string;
  last_name?: string;
  street_address?: string;
  address_locality?: string;
  address_region?: string;
  postal_code?: string;
  address_country?: string;
  [field: string]: unknown;
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

export interface CheckoutLineItem {
  id: string;
  quantity: number;
  item: {
    id: string;
    title: string;
    price: number;
    image_url?: string | null;
  };
  totals: Total[];
}

export interface CheckoutSession {
  id: string;
  status: string;
  currency: string;
  line_items: CheckoutLineItem[];
  totals: Total[];
  fulfillment?: { methods?: FulfillmentMethod[] };
  order?: { id: string; permalink_url?: string };
}

export interface GiftCardCredential {
  type: "gift_card";
  code: string;
  pin: string;
}

export interface CardCredential {
  type: "card";
  token: string;
}

export interface PaymentInstrument {
  id: string;
  type: string;
  handler_id: string;
  credential: Record<string, string>;
}
