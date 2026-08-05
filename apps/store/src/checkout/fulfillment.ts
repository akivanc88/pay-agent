/** Builds checkout destinations, fulfillment groups, and merchant shipping quotes. */

import { v4 as uuidv4 } from "uuid";

import type {
  Buyer,
  FulfillmentDestinationRequest,
  FulfillmentDestinationResponse,
  FulfillmentRequest,
  FulfillmentResponse,
  LineItemResponse,
} from "../models";

function addressesMatch(
  existing: FulfillmentDestinationResponse,
  requested: FulfillmentDestinationRequest,
): boolean {
  return (
    existing.street_address === requested.street_address &&
    existing.address_locality === requested.address_locality &&
    existing.address_region === requested.address_region &&
    existing.address_country === requested.address_country &&
    existing.postal_code === requested.postal_code
  );
}

export function constructFulfillmentResponse(
  request: FulfillmentRequest | undefined,
  lineItems: LineItemResponse[],
  buyer?: Buyer | null,
  existing?: FulfillmentResponse,
): FulfillmentResponse | undefined {
  if (!request) return undefined;

  const isKnownCustomer = buyer?.email === "john.doe@example.com";
  const knownDestinations: FulfillmentDestinationResponse[] = isKnownCustomer
    ? [
        {
          id: "addr_1",
          address_country: "US",
          street_address: "123 Main St",
          address_locality: "Springfield",
          address_region: "IL",
          postal_code: "62704",
          first_name: "John",
          last_name: "Doe",
        },
        {
          id: "addr_2",
          address_country: "US",
          street_address: "456 Oak Ave",
          address_locality: "Metropolis",
          address_region: "NY",
          postal_code: "10012",
          first_name: "John",
          last_name: "Doe",
        },
      ]
    : [];

  return {
    methods: (request.methods || []).map((method) => {
      let destinations: FulfillmentDestinationResponse[] | undefined;
      if (method.destinations && Array.isArray(method.destinations)) {
        destinations = method.destinations.map((destination) => {
          if (!destination.id) {
            const matched = knownDestinations.find((candidate) =>
              addressesMatch(candidate, destination),
            );
            if (matched) {
              return { ...destination, id: matched.id } as FulfillmentDestinationResponse;
            }
          }
          return {
            ...destination,
            id: destination.id || `dest_${uuidv4()}`,
          } as FulfillmentDestinationResponse;
        });
      } else if (existing?.methods) {
        const targetType = method.type || "shipping";
        destinations = existing.methods.find(
          (candidate) => candidate.type === targetType,
        )?.destinations;
      } else if (isKnownCustomer) {
        destinations = knownDestinations;
      }

      const groups = (method.groups || []).map((group) => ({
        id: `group_${uuidv4()}`,
        line_item_ids: lineItems.map((lineItem) => lineItem.id),
        selected_option_id: group.selected_option_id,
        options: [],
      }));

      return {
        id: `method_${uuidv4()}`,
        type: method.type || "shipping",
        line_item_ids: lineItems.map((lineItem) => lineItem.id),
        ...(destinations ? { destinations } : {}),
        selected_destination_id: method.selected_destination_id,
        groups,
      };
    }),
  };
}
