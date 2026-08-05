import { createHash } from "crypto";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { UCP_VERSION } from "../utils/config";

import {
  getCheckoutSession,
  getIdempotencyRecord,
  getInventory,
  getOrder,
  getProduct,
  logRequest,
  releaseStock,
  reserveStock,
  saveCheckout,
  saveIdempotencyRecord,
  saveOrder,
} from "../data";
import {
  CheckoutResponseStatusSchema,
  type Buyer,
  type Expectation,
  type ExpectationLineItem,
  type ExtendedCheckoutCreateRequest,
  type ExtendedCheckoutResponse,
  type ExtendedCheckoutUpdateRequest,
  ExtendedPaymentCredentialSchema,
  type FulfillmentDestinationRequest,
  type FulfillmentDestinationResponse,
  type FulfillmentOption,
  type FulfillmentRequest,
  type FulfillmentResponse,
  type LineItemCreateRequest,
  type LineItemResponse,
  type Order,
  type OrderLineItem,
  type PaymentCreateRequest,
  CheckoutCompleteRequestSchema,
  type CheckoutCompleteRequest,
  type PostalAddress,
} from "../models";
import { type IdParamContext } from "../utils/validation";
import { DEFAULT_CURRENCY, minorUnits } from "@pay-agent/db";
import {
  GiftCardError,
  reverseSettlement,
  settleGiftCards,
  type SettlementResult,
} from "../payments/gift-card";
import {
  STRIPE_HANDLER_ID,
  authorizeCard,
  cancelAuthorization,
  captureAuthorization,
  testClient,
  type Authorization,
} from "../payments/stripe";
import type Stripe from "stripe";

// zCompleteCheckoutRequest and CompleteCheckoutRequest are now imported from SDK models

/**
 * Service for managing checkout sessions.
 */
export class CheckoutService {
  private computeHash(data: unknown): string {
    const replacer = (_key: string, value: unknown) =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((sorted, k) => {
              sorted[k] = (value as Record<string, unknown>)[k];
              return sorted;
            }, {})
        : value;
    return createHash("sha256")
      .update(JSON.stringify(data, replacer))
      .digest("hex");
  }

  private async parseAgentProfile(
    ucpAgentHeader: string | undefined
  ): Promise<{ webhook_url?: string } | undefined> {
    if (!ucpAgentHeader) return undefined;

    const match = ucpAgentHeader.match(/profile="([^"]+)"/);
    if (!match) return undefined;

    const profileUri = match[1];

    try {
      let profileData:
        | {
            ucp?: {
              capabilities?: Record<
                string,
                Array<{
                  name: string;
                  config?: { webhook_url?: string };
                }>
              >;
            };
          }
        | undefined;

      if (profileUri.startsWith("data:")) {
        const base64Data = profileUri.split(",")[1];
        if (base64Data) {
          const jsonStr = Buffer.from(base64Data, "base64").toString("utf-8");
          profileData = JSON.parse(jsonStr);
        }
      } else if (profileUri.startsWith("http")) {
        const response = await fetch(profileUri);
        if (response.ok) {
          profileData = (await response.json()) as typeof profileData;
        }
      }

      if (profileData && profileData.ucp && profileData.ucp.capabilities) {
        const orderCaps =
          profileData.ucp.capabilities["dev.ucp.shopping.order"];
        if (orderCaps && orderCaps.length > 0) {
          const orderCap = orderCaps[0];
          if (orderCap && orderCap.config && orderCap.config.webhook_url) {
            return { webhook_url: orderCap.config.webhook_url };
          }
        }
      }
    } catch (e) {
      console.warn("Failed to fetch or parse agent profile", e);
    }
    return undefined;
  }

  /**
   * Notifies the configured platform webhook of an order event.
   *
   * Per the UCP REST OpenAPI (`webhooks.orderEvent`), the request body is the
   * order object itself (`#/components/schemas/order`); the event type is
   * conveyed out of band in the `X-Event-Type` header. The body must always be
   * a valid order, so no notification is sent when there is no order to deliver.
   */
  private async notifyWebhook(
    checkout: ExtendedCheckoutResponse,
    eventType: string
  ): Promise<void> {
    if (!checkout.platform?.webhook_url) {
      return;
    }

    let orderData: Order | undefined = undefined;
    if (checkout.order) {
      orderData = getOrder(checkout.order.id);
    }

    if (!orderData) {
      console.warn(
        `Skipping ${eventType} webhook for checkout ${checkout.id}: no order to deliver`
      );
      return;
    }

    const webhookUrl = checkout.platform.webhook_url;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Event-Type": eventType,
          "Webhook-Id": uuidv4(),
          "Webhook-Timestamp": Math.floor(Date.now() / 1000).toString(),
        },
        body: JSON.stringify(orderData),
      });
    } catch (e) {
      console.error(`Failed to notify webhook at ${webhookUrl}`, e);
    }
  }

  private addressesMatch(
    addr1: FulfillmentDestinationResponse,
    addr2: FulfillmentDestinationRequest
  ): boolean {
    return (
      addr1.street_address === addr2.street_address &&
      addr1.address_locality === addr2.address_locality &&
      addr1.address_region === addr2.address_region &&
      addr1.address_country === addr2.address_country &&
      addr1.postal_code === addr2.postal_code
    );
  }

  private constructFulfillmentResponse(
    reqFulfillment: FulfillmentRequest | undefined,
    lineItems: LineItemResponse[],
    buyer?: Buyer | null,
    existingFulfillment?: FulfillmentResponse
  ): FulfillmentResponse | undefined {
    if (!reqFulfillment) {
      return undefined;
    }

    const isKnownCustomer = buyer?.email === "john.doe@example.com";
    const mockDestinations: FulfillmentDestinationResponse[] = isKnownCustomer
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
      methods: (reqFulfillment.methods || []).map((m) => {
        let destinations: FulfillmentDestinationResponse[] | undefined =
          undefined;
        if (m.destinations && Array.isArray(m.destinations)) {
          destinations = m.destinations.map(
            (d): FulfillmentDestinationResponse => {
              if (!d.id) {
                const matched = mockDestinations.find((md) =>
                  this.addressesMatch(md, d)
                );
                if (matched) {
                  return {
                    ...d,
                    id: matched.id,
                  } as FulfillmentDestinationResponse;
                }
              }
              return {
                ...d,
                id: d.id || `dest_${uuidv4()}`,
              } as FulfillmentDestinationResponse;
            }
          );
        } else if (existingFulfillment && existingFulfillment.methods) {
          const targetType = m.type || "shipping";
          const existingMethod = existingFulfillment.methods.find(
            (em) => em.type === targetType
          );
          if (existingMethod && existingMethod.destinations) {
            destinations = existingMethod.destinations;
          }
        } else if (isKnownCustomer) {
          destinations = mockDestinations;
        }

        const groups = (m.groups || []).map((g) => ({
          id: `group_${uuidv4()}`,
          line_item_ids: lineItems.map((li) => li.id),
          selected_option_id: g.selected_option_id,
          options: [], // Will be populated in recalculateTotals
        }));

        return {
          id: `method_${uuidv4()}`,
          type: m.type || "shipping",
          line_item_ids: lineItems.map((li) => li.id),
          ...(destinations ? { destinations } : {}),
          selected_destination_id: m.selected_destination_id,
          groups,
        };
      }),
    };
  }

  private recalculateTotals(checkout: ExtendedCheckoutResponse): void {
    let grandTotal = 0;

    // Line Items
    for (const line of checkout.line_items) {
      const product = getProduct(line.item.id);
      if (!product) {
        throw new Error(`Product ${line.item.id} not found`);
      }
      // Authoritative price and title
      line.item.price = product.price;
      line.item.title = product.title;

      const lineTotal = product.price * line.quantity;
      line.totals = [
        { type: "subtotal", amount: lineTotal },
        { type: "total", amount: lineTotal },
      ];
      grandTotal += lineTotal;
    }

    checkout.totals = [];
    checkout.totals.push({ type: "subtotal", amount: grandTotal });

    // Fulfillment Logic (Mock)
    if (checkout.fulfillment?.methods) {
      for (const method of checkout.fulfillment.methods) {
        if (
          method.type === "shipping" &&
          method.selected_destination_id &&
          method.destinations
        ) {
          const dest = method.destinations.find(
            (d: FulfillmentDestinationResponse) =>
              d.id === method.selected_destination_id
          );

          // Extract country from flat field or nested address
          let country = dest?.address_country;
          if (!country && dest?.address) {
            country = dest.address.address_country;
          }

          if (dest && country) {
            const options: FulfillmentOption[] = [];

            if (country === "US") {
              const hasRoses = checkout.line_items.some(
                (li) => li.item.id === "bouquet_roses"
              );
              const isExpensive = grandTotal >= 10000;
              const stdShipCost = hasRoses || isExpensive ? 0 : 500;

              options.push(
                {
                  id: "std-ship",
                  title:
                    stdShipCost === 0
                      ? "Free Standard Shipping"
                      : "Standard Shipping",
                  description: "Arrives in 5-7 days",
                  totals: [
                    { type: "subtotal", amount: stdShipCost },
                    { type: "total", amount: stdShipCost },
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
                }
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

            // Assign options to groups
            if (!method.groups || method.groups.length === 0) {
              method.groups = [
                {
                  id: `group_${uuidv4()}`,
                  line_item_ids: method.line_item_ids,
                  options,
                },
              ];
            } else {
              // Update all groups with available options
              for (const group of method.groups) {
                group.options = options;
              }
            }

            // Calculate total from selected option
            for (const group of method.groups) {
              if (group.selected_option_id && group.options) {
                const selected = group.options.find(
                  (o: FulfillmentOption) => o.id === group.selected_option_id
                );
                if (selected) {
                  const totalObj = selected.totals.find(
                    (t) => t.type === "total"
                  );
                  const totalAmount = totalObj ? totalObj.amount : 0;
                  grandTotal += totalAmount;
                  checkout.totals.push({
                    type: "fulfillment",
                    amount: totalAmount,
                    display_text: selected.title,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Discount Logic (Mock)
    if (!checkout.discounts) {
      checkout.discounts = {};
    }
    checkout.discounts.applied = [];
    if (checkout.discounts.codes) {
      for (const code of checkout.discounts.codes) {
        if (typeof code !== "string") continue;
        const upperCode = code.toUpperCase();
        if (upperCode === "10OFF") {
          const discountAmount = Math.floor(grandTotal * 0.1);
          grandTotal -= discountAmount;
          checkout.discounts.applied.push({
            code,
            title: "10% Off",
            amount: discountAmount,
            allocations: [{ path: "subtotal", amount: discountAmount }],
          });
          checkout.totals.push({ type: "discount", amount: -discountAmount });
        } else if (upperCode === "WELCOME20") {
          const discountAmount = Math.floor(grandTotal * 0.2);
          grandTotal -= discountAmount;
          checkout.discounts.applied.push({
            code,
            title: "Welcome 20% Off",
            amount: discountAmount,
            allocations: [{ path: "subtotal", amount: discountAmount }],
          });
          checkout.totals.push({ type: "discount", amount: -discountAmount });
        } else if (upperCode === "FIXED500") {
          const discountAmount = Math.min(grandTotal, 500);
          grandTotal -= discountAmount;
          checkout.discounts.applied.push({
            code,
            title: "$5.00 Off",
            amount: discountAmount,
            allocations: [{ path: "subtotal", amount: discountAmount }],
          });
          checkout.totals.push({ type: "discount", amount: -discountAmount });
        }
      }
    }

    // Enrich Buyer Consent if present
    if (checkout.buyer?.consent) {
      for (const [purpose, value] of Object.entries(checkout.buyer.consent)) {
        if (value && typeof value === "object") {
          const consentValue = value as any;
          if (!consentValue.description) {
            consentValue.description = `Consent for ${purpose}`;
          }
          if (!consentValue.source) {
            consentValue.source = "platform";
          }
        }
      }
    }

    checkout.totals.push({ type: "total", amount: grandTotal });
  }

  private validateInventory(checkout: ExtendedCheckoutResponse): void {
    for (const line of checkout.line_items) {
      const qtyAvail = getInventory(line.item.id);
      if (qtyAvail === undefined || qtyAvail < line.quantity) {
        throw new Error(`Insufficient stock for item ${line.item.id}`);
      }
    }
  }

  createCheckout = async (c: Context) => {
    const idempotencyKey = c.req.header("Idempotency-Key");
    const ucpAgent = c.req.header("UCP-Agent");
    const request = await c.req.json<ExtendedCheckoutCreateRequest>();
    let requestHash = "";

    if (idempotencyKey) {
      requestHash = this.computeHash(request);
      const record = getIdempotencyRecord(idempotencyKey);
      if (record) {
        if (record.request_hash !== requestHash) {
          return c.json(
            { detail: "Idempotency key reused with different parameters" },
            409
          );
        }
        return c.json(JSON.parse(record.response_body), 201);
      }
    }

    const checkoutId = uuidv4();

    // Log Request
    logRequest("POST", "/checkout-sessions", checkoutId, request);

    try {
      // Validate items exists and build initial line items from request
      // The client sends line_items with item.id and quantity.
      const lineItems: LineItemResponse[] = [];

      for (let i = 0; i < request.line_items.length; i++) {
        const reqLine = request.line_items[i];
        const productId = reqLine.item.id;
        const quantity = reqLine.quantity;

        if (!productId) {
          return c.json({ detail: `Line item ${i} missing product ID` }, 400);
        }

        const product = getProduct(productId);
        if (!product) {
          return c.json({ detail: `Product ${productId} not found` }, 400);
        }

        lineItems.push({
          id: `line_${i + 1}`,
          quantity,
          totals: [],
          item: {
            id: product.id,
            title: product.title,
            price: product.price,
            image_url: product.image_url,
          },
        });
      }

      const { fulfillment: _reqFulfillment, ...requestBody } = request;

      const fulfillment = this.constructFulfillmentResponse(
        _reqFulfillment,
        lineItems,
        request.buyer
      );

      // Construct authoritative checkout
      const platformConfig = await this.parseAgentProfile(ucpAgent);

      const checkout: ExtendedCheckoutResponse = {
        ...requestBody, // Copy other fields like ucp, etc.
        id: checkoutId,
        fulfillment,
        ucp: {
          version: UCP_VERSION,
          capabilities: {
            "dev.ucp.shopping.checkout": [
              {
                name: "dev.ucp.shopping.checkout",
                version: UCP_VERSION,
              },
            ],
          },
        },
        status: CheckoutResponseStatusSchema.enum.incomplete,
        // The merchant is authoritative on currency, and the request's value is advisory
        // (upstream hardcoded "USD" here for the same reason). It must match the funding
        // ledger: a gift card drawn in one currency against a total quoted in another puts
        // an exchange rate between the balance and the amount authorized, which would make
        // "the charge exceeds the balance" approximate — and that comparison is the entire
        // basis of the guarded live path.
        currency: DEFAULT_CURRENCY,
        line_items: lineItems,
        totals: [],
        links: [],
        platform: platformConfig,
        payment: request.payment,
      };

      // Calculate totals and validate inventory
      this.recalculateTotals(checkout);
      this.validateInventory(checkout);

      saveCheckout(checkout.id, checkout.status, checkout);

      if (idempotencyKey) {
        saveIdempotencyRecord(
          idempotencyKey,
          requestHash,
          201,
          JSON.stringify(checkout)
        );
      }

      return c.json(checkout, 201);
    } catch (e: unknown) {
      return c.json(
        { detail: e instanceof Error ? e.message : String(e) },
        400
      );
    }
  };

  getCheckout = async (c: IdParamContext) => {
    const { id } = c.req.valid("param");

    // Log Request
    logRequest("GET", `/checkout-sessions/${id}`, id, {});

    const checkout = getCheckoutSession(id);
    if (!checkout) {
      return c.json({ detail: "Checkout session not found" }, 404);
    }
    return c.json(checkout, 200);
  };

  updateCheckout = async (c: IdParamContext) => {
    const { id } = c.req.valid("param");
    const idempotencyKey = c.req.header("Idempotency-Key");
    const ucpAgent = c.req.header("UCP-Agent");
    const updateRequest = await c.req.json<ExtendedCheckoutUpdateRequest>();
    let requestHash = "";

    if (idempotencyKey) {
      requestHash = this.computeHash(updateRequest);
      const record = getIdempotencyRecord(idempotencyKey);
      if (record) {
        if (record.request_hash !== requestHash) {
          return c.json(
            { detail: "Idempotency key reused with different parameters" },
            409
          );
        }
        return c.json(JSON.parse(record.response_body), 200);
      }
    }

    // Log Request
    logRequest("PUT", `/checkout-sessions/${id}`, id, updateRequest);

    const existing = getCheckoutSession(id);
    if (!existing) {
      return c.json({ detail: "Checkout session not found" }, 404);
    }

    if (
      existing.status === CheckoutResponseStatusSchema.enum.completed ||
      existing.status === CheckoutResponseStatusSchema.enum.canceled
    ) {
      return c.json(
        { detail: `Cannot update a ${existing.status} checkout session` },
        409
      );
    }

    // Merge updateRequest into existing.
    if (updateRequest.buyer) {
      existing.buyer = updateRequest.buyer;
    }
    const platformConfig = await this.parseAgentProfile(ucpAgent);
    if (platformConfig) {
      existing.platform = platformConfig;
    }

    // Simple merge for payment. In real world, this might be more complex.
    existing.payment = {
      ...existing.payment,
      ...updateRequest.payment,
    };

    if (updateRequest.discounts) {
      existing.discounts = updateRequest.discounts;
    }

    // Update Line Items
    const newLineItems: LineItemResponse[] = [];
    for (const reqLine of updateRequest.line_items) {
      const productId = reqLine.item.id;
      const quantity = reqLine.quantity;

      if (!productId) {
        return c.json({ detail: `Line item missing product ID` }, 400);
      }
      const product = getProduct(productId);
      if (!product) {
        return c.json({ detail: `Product ${productId} not found` }, 400);
      }

      newLineItems.push({
        id: reqLine.id || `line_${newLineItems.length + 1}`,
        quantity,
        totals: [],
        item: {
          id: product.id,
          title: product.title,
          price: product.price,
          image_url: product.image_url,
        },
      });
    }
    existing.line_items = newLineItems;

    if (updateRequest.fulfillment) {
      existing.fulfillment = this.constructFulfillmentResponse(
        updateRequest.fulfillment,
        existing.line_items,
        existing.buyer,
        existing.fulfillment
      );
    }

    // Recalculate and Validate
    try {
      this.recalculateTotals(existing);
      this.validateInventory(existing);

      saveCheckout(id, existing.status, existing);

      if (idempotencyKey) {
        saveIdempotencyRecord(
          idempotencyKey,
          requestHash,
          200,
          JSON.stringify(existing)
        );
      }

      return c.json(existing, 200);
    } catch (e: unknown) {
      return c.json(
        { detail: e instanceof Error ? e.message : String(e) },
        400
      );
    }
  };

  completeCheckout = async (c: IdParamContext) => {
    const { id } = c.req.valid("param");
    const idempotencyKey = c.req.header("Idempotency-Key");
    const rawBody = await c.req.json<CheckoutCompleteRequest>();
    let requestHash = "";

    // Idempotency check for payment data
    if (idempotencyKey) {
      requestHash = this.computeHash(rawBody);
      const record = getIdempotencyRecord(idempotencyKey);
      if (record) {
        if (record.request_hash !== requestHash) {
          return c.json(
            { detail: "Idempotency key reused with different parameters" },
            409
          );
        }
        return c.json(JSON.parse(record.response_body), 200);
      }
    }

    // Log Request
    logRequest("POST", `/checkout-sessions/${id}/complete`, id, rawBody);

    const checkout = getCheckoutSession(id);
    if (!checkout) {
      return c.json({ detail: "Checkout session not found" }, 404);
    }

    // Validate Fulfillment is complete
    const hasFulfillment = checkout.fulfillment?.methods?.every(
      (method) =>
        method.selected_destination_id &&
        method.groups?.every((group) => group.selected_option_id)
    );

    if (!hasFulfillment) {
      return c.json(
        { detail: "Fulfillment address and option must be selected" },
        400
      );
    }

    if (
      checkout.status === CheckoutResponseStatusSchema.enum.completed ||
      checkout.status === CheckoutResponseStatusSchema.enum.canceled
    ) {
      // If already completed and not caught by idempotency, it's a conflict
      return c.json({ detail: `Checkout already completed or canceled` }, 409);
    }

    // Process Payment
    const payment = rawBody.payment;
    if (!payment || !payment.instruments || payment.instruments.length === 0) {
      return c.json({ detail: "Missing payment data" }, 400);
    }

    /**
     * Settle gift cards across the *whole* instruments array.
     *
     * Upstream reads only `payment.instruments[0]`, so a cart paid with a gift card and a
     * card is expressible in UCP but unhandled by the reference implementation. Drawing
     * every gift card first, then leaving a remainder for another rail, is the split
     * payment this project exists to demonstrate.
     *
     * `runId` groups the draws so that any later failure can hand every cent back.
     */
    const runId = `run_${uuidv4()}`;
    const amountDue = minorUnits(
      checkout.totals?.find((t) => t.type === "total")?.amount ??
        checkout.totals?.find((t) => t.type === "subtotal")?.amount ??
        0,
    );

    let settlement: SettlementResult | undefined;
    const giftCardInstruments = payment.instruments.filter(
      (i: { type?: string }) => i?.type === "gift_card",
    );

    if (giftCardInstruments.length > 0) {
      try {
        settlement = await settleGiftCards(payment.instruments, amountDue, runId);
      } catch (err) {
        // Nothing has been drawn if resolution failed, but reverse anyway: a partially
        // applied array must never leave money taken for a checkout that did not complete.
        await reverseSettlement(runId).catch(() => undefined);
        if (err instanceof GiftCardError) {
          return c.json({ detail: err.message }, err.status);
        }
        throw err;
      }

      // A remainder is not an error — it is what the other instruments are for. But if the
      // gift cards fall short and nothing else was presented, the cart cannot be paid.
      const hasOtherInstrument = payment.instruments.some(
        (i: { type?: string }) => i?.type !== "gift_card",
      );
      if (settlement.remaining > 0 && !hasOtherInstrument) {
        await reverseSettlement(runId);
        return c.json(
          {
            detail:
              `Gift cards covered ${settlement.covered} of ${amountDue}; ` +
              `${settlement.remaining} remains and no other payment instrument was supplied`,
            code: "insufficient_funds",
          },
          402,
        );
      }
    }

    /**
     * The card rail's provisional state, mirroring the gift cards'.
     *
     * A gift-card draw is undone by a compensating ledger entry; a card authorization is
     * undone by cancelling it. Both are held open until the order exists, so that neither
     * can outlive a checkout that failed.
     */
    let stripe: Stripe | null = null;
    let authorization: Authorization | undefined;
    // True once the card money is actually taken. Past that point there is nothing to unwind on a
    // later throw (the money is captured and the order placed); before it, everything is reversible.
    let didCapture = false;

    /**
     * Fail the checkout, giving back everything already committed to it.
     *
     * Every failure path below has to route through this. Money taken for a checkout that
     * does not complete must not simply stay taken, and "remember to reverse" repeated at
     * seven return sites is a bug waiting to happen. The card leg is released before the
     * gift cards because it is the one holding a real issuer's funds.
     */
    const failPayment = async (
      detail: string,
      status: 400 | 402 | 403 | 409,
      code?: string,
    ) => {
      if (stripe && authorization) await cancelAuthorization(stripe, authorization);
      if (settlement) await reverseSettlement(runId).catch(() => undefined);
      return c.json(code ? { detail, code } : { detail }, status);
    };

    // Non-gift-card instruments keep the upstream handler behaviour.
    const selectedInstrument = payment.instruments.find(
      (i: { type?: string }) => i?.type !== "gift_card",
    );

    if (selectedInstrument) {
      const handlerId = selectedInstrument.handler_id;
      const credential = selectedInstrument.credential;
      if (!credential) {
        return failPayment("Missing credentials in instrument", 400);
      }

      if (handlerId === STRIPE_HANDLER_ID) {
        /**
         * The card rail, for real.
         *
         * It is authorized for **what the gift cards could not cover**, not for the cart
         * total — that remainder is the whole point of settling the instruments array. When
         * the gift cards covered everything the rail is not touched at all: a zero-amount
         * authorization is not a thing, and asking for one would fail the checkout at the
         * moment it had actually succeeded.
         */
        const amountToAuthorize = settlement ? settlement.remaining : amountDue;

        const parsedCredential =
          ExtendedPaymentCredentialSchema.safeParse(credential);
        const paymentMethodId = parsedCredential.success
          ? parsedCredential.data.token
          : undefined;

        if (!paymentMethodId?.startsWith("pm_")) {
          return failPayment(
            "Stripe instrument requires a PaymentMethod id (pm_…) as its credential token",
            400,
          );
        }

        if (amountToAuthorize > 0) {
          stripe = testClient();
          if (!stripe) {
            return failPayment(
              "Stripe handler requested but STRIPE_SECRET_KEY is not configured",
              400,
            );
          }

          const outcome = await authorizeCard({
            stripe,
            paymentMethodId,
            amount: amountToAuthorize,
            currency: checkout.currency,
            runId,
            checkoutId: checkout.id,
          });

          if (!outcome.ok) {
            return failPayment(
              `Card authorization failed: ${outcome.message}`,
              outcome.status,
              outcome.code,
            );
          }
          authorization = outcome.authorization;
        }
      } else if (selectedInstrument.type === "card" && credential.type === "card") {
        // success
      } else {
        const parsedCredential =
          ExtendedPaymentCredentialSchema.safeParse(credential);
        const token = parsedCredential.success
          ? parsedCredential.data.token
          : undefined;

        if (handlerId === "mock_payment_handler") {
          if (token === "success_token") {
            // Success
          } else if (token === "fail_token") {
            return failPayment("Payment Failed: Insufficient Funds (Mock)", 402);
          } else if (token === "fraud_token") {
            return failPayment("Payment Failed: Fraud Detected (Mock)", 403);
          } else {
            return failPayment(`Unknown mock token: ${token}`, 400);
          }
        } else if (
          handlerId === "google_pay" ||
          handlerId === "gpay" ||
          handlerId === "shop_pay"
        ) {
          // Mock success
        } else {
          return failPayment(`Unsupported payment handler: ${handlerId}`, 400);
        }
      }
    }

    // Atomic Inventory Reservation and Completion
    try {
      const reservedItems: Array<{ id: string; qty: number }> = [];

      for (const line of checkout.line_items) {
        const product = getProduct(line.item.id);
        if (product) {
          const success = reserveStock(line.item.id, line.quantity);
          if (!success) {
            // Rollback
            for (const reserved of reservedItems) {
              releaseStock(reserved.id, reserved.qty);
            }
            return failPayment(`Item ${line.item.id} is out of stock`, 409);
          }
          reservedItems.push({ id: line.item.id, qty: line.quantity });
        }
      }

      // Success
      checkout.status = CheckoutResponseStatusSchema.enum.completed;

      // Create Order
      const orderId = `ord_${uuidv4()}`;

      // Order Fulfillment
      const expectations: Expectation[] = [];

      if (checkout.fulfillment?.methods) {
        for (const method of checkout.fulfillment.methods) {
          // Determine fulfillment address
          let fulfillmentAddress: PostalAddress = {};
          if (method.selected_destination_id && method.destinations) {
            const dest = method.destinations.find(
              (d: FulfillmentDestinationResponse) =>
                d.id === method.selected_destination_id
            );
            if (dest) {
              if (dest.address) {
                // It's a RetailLocation, use its address
                fulfillmentAddress = dest.address;
              } else {
                // It's a PostalAddress (or mixed object in generated types)
                fulfillmentAddress = dest;
              }
            }
          }

          if (method.groups) {
            for (const group of method.groups) {
              if (group.selected_option_id && group.options) {
                const selected = group.options.find(
                  (opt: FulfillmentOption) =>
                    opt.id === group.selected_option_id
                );
                if (selected) {
                  const expectationId = `exp_${uuidv4()}`;
                  const expLineItems: ExpectationLineItem[] = [];

                  if (group.line_item_ids) {
                    for (const liId of group.line_item_ids) {
                      const checkoutLineItem = checkout.line_items.find(
                        (li) => li.id === liId
                      );
                      if (checkoutLineItem) {
                        expLineItems.push({
                          id: checkoutLineItem.id,
                          quantity: checkoutLineItem.quantity,
                        });
                      }
                    }
                  }

                  expectations.push({
                    id: expectationId,
                    destination: fulfillmentAddress,
                    method_type: method.type,
                    line_items: expLineItems,
                    description: selected.title,
                  });
                }
              }
            }
          }
        }
      }

      const orderLineItems: OrderLineItem[] = checkout.line_items.map(
        (li: LineItemResponse) => {
          return {
            id: li.id,
            item: li.item,
            quantity: {
              total: li.quantity,
              fulfilled: 0,
            },
            totals: li.totals,
            status: "processing",
            parent_id: li.parent_id,
          };
        }
      );

      const order: Order = {
        ucp: checkout.ucp,
        id: orderId,
        checkout_id: checkout.id,
        permalink_url: `http://localhost:8080/orders/${orderId}`,
        line_items: orderLineItems,
        totals: checkout.totals,
        fulfillment: {
          expectations,
        },
        currency: checkout.currency,
      };

      /**
       * Take the money, last.
       *
       * Everything above this line is reversible; nothing below it can fail. Capturing here
       * rather than at authorization time means a checkout that falls over between the two
       * — out of stock, a bad line item — releases the hold instead of charging for an order
       * that was never placed.
       */
      if (stripe && authorization) {
        const captured = await captureAuthorization(stripe, authorization);
        if (!captured.ok) {
          for (const reserved of reservedItems) {
            releaseStock(reserved.id, reserved.qty);
          }
          return failPayment(
            `Card capture failed: ${captured.message}`,
            captured.status,
            captured.code,
          );
        }
        didCapture = true;
      }

      saveOrder(order.id, order);

      // Save Checkout
      checkout.order = {
        id: orderId,
        permalink_url: order.permalink_url,
      };

      saveCheckout(id, checkout.status, checkout);

      // Notify webhook. Non-fatal: the money is captured and the order is placed, so a webhook
      // hiccup must not throw the handler into a 500 for an order that genuinely succeeded.
      await this.notifyWebhook(checkout, "order_placed").catch((err) =>
        console.error("Webhook notify failed after order placed", err),
      );

      if (idempotencyKey) {
        saveIdempotencyRecord(
          idempotencyKey,
          requestHash,
          200,
          JSON.stringify(checkout)
        );
      }

      return c.json(checkout, 200);
    } catch (e) {
      console.error("Error completing checkout", e);
      // A thrown error must not leave money committed to a checkout that did not complete. Every
      // *handled* failure already routes through failPayment; this is the backstop for a genuine
      // exception. Before capture, release the card hold and hand back every gift-card draw; after
      // capture the money is taken and the order placed, so there is nothing here to unwind.
      if (!didCapture) {
        if (stripe && authorization) {
          await cancelAuthorization(stripe, authorization).catch(() => undefined);
        }
        if (settlement) await reverseSettlement(runId).catch(() => undefined);
      }
      return c.json({ detail: "Internal server error" }, 500);
    }
  };

  cancelCheckout = async (c: IdParamContext) => {
    const { id } = c.req.valid("param");
    const idempotencyKey = c.req.header("Idempotency-Key");
    const rawBody = {}; // Empty body for cancel usually
    let requestHash = "";

    if (idempotencyKey) {
      requestHash = this.computeHash(rawBody);
      const record = getIdempotencyRecord(idempotencyKey);
      if (record) {
        if (record.request_hash !== requestHash) {
          return c.json(
            { detail: "Idempotency key reused with different parameters" },
            409
          );
        }
        return c.json(JSON.parse(record.response_body), 200);
      }
    }

    logRequest("POST", `/checkout-sessions/${id}/cancel`, id, rawBody);

    const checkout = getCheckoutSession(id);
    if (!checkout) {
      return c.json({ detail: "Checkout session not found" }, 404);
    }

    if (
      checkout.status === CheckoutResponseStatusSchema.enum.completed ||
      checkout.status === CheckoutResponseStatusSchema.enum.canceled
    ) {
      return c.json(
        { detail: `Cannot cancel a ${checkout.status} checkout session` },
        409
      );
    }

    checkout.status = CheckoutResponseStatusSchema.enum.canceled;
    saveCheckout(id, checkout.status, checkout);

    if (idempotencyKey) {
      saveIdempotencyRecord(
        idempotencyKey,
        requestHash,
        200,
        JSON.stringify(checkout)
      );
    }

    return c.json(checkout, 200);
  };

  shipOrder = async (orderId: string): Promise<void> => {
    const order = getOrder(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (!order.fulfillment.events) {
      order.fulfillment.events = [];
    }

    order.fulfillment.events.push({
      id: `evt_${uuidv4()}`,
      type: "shipped",
      occurred_at: new Date(),
      line_items: [],
    });

    saveOrder(order.id, order);

    const checkout = getCheckoutSession(order.checkout_id);
    if (checkout) {
      await this.notifyWebhook(checkout, "order_shipped");
    }
  };
}
