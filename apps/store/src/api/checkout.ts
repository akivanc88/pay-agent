/** Provides the compatible Hono checkout facade while delegating domain work to checkout modules. */

import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { UCP_VERSION } from "../utils/config";

import {
  getCheckoutSession,
  getOrder,
  getProduct,
  logRequest,
  saveCheckout,
  saveOrder,
} from "../data";
import {
  CheckoutResponseStatusSchema,
  type Buyer,
  type ExtendedCheckoutCreateRequest,
  type ExtendedCheckoutResponse,
  type ExtendedCheckoutUpdateRequest,
  type FulfillmentRequest,
  type FulfillmentResponse,
  type LineItemResponse,
  type CheckoutCompleteRequest,
} from "../models";
import { type IdParamContext } from "../utils/validation";
import { DEFAULT_CURRENCY, minorUnits } from "@pay-agent/db";
import {
  computeIdempotencyHash,
  findIdempotencyReplay,
  storeIdempotencyResult,
} from "../checkout/idempotency";
import { constructFulfillmentResponse } from "../checkout/fulfillment";
import { recalculateTotals, validateInventory } from "../checkout/pricing";
import { notifyOrderWebhook, parseAgentProfile } from "../checkout/platform";
import {
  constructOrder,
  InventoryReservation,
  recordShipment,
} from "../checkout/order";
import { PaymentAttempt, type PaymentFailure } from "../checkout/payment-attempt";

// zCompleteCheckoutRequest and CompleteCheckoutRequest are now imported from SDK models

/**
 * Service for managing checkout sessions.
 */
export class CheckoutService {
  private computeHash(data: unknown): string {
    return computeIdempotencyHash(data);
  }

  private async parseAgentProfile(ucpAgentHeader: string | undefined) {
    return parseAgentProfile(ucpAgentHeader);
  }

  private async notifyWebhook(
    checkout: ExtendedCheckoutResponse,
    eventType: string,
  ): Promise<void> {
    return notifyOrderWebhook(checkout, eventType);
  }

  private constructFulfillmentResponse(
    request: FulfillmentRequest | undefined,
    lineItems: LineItemResponse[],
    buyer?: Buyer | null,
    existing?: FulfillmentResponse,
  ): FulfillmentResponse | undefined {
    return constructFulfillmentResponse(request, lineItems, buyer, existing);
  }

  private recalculateTotals(checkout: ExtendedCheckoutResponse): void {
    recalculateTotals(checkout);
  }

  private validateInventory(checkout: ExtendedCheckoutResponse): void {
    validateInventory(checkout);
  }

  createCheckout = async (c: Context) => {
    const idempotencyKey = c.req.header("Idempotency-Key");
    const ucpAgent = c.req.header("UCP-Agent");
    const request = await c.req.json<ExtendedCheckoutCreateRequest>();
    let requestHash = "";

    if (idempotencyKey) {
      const replay = findIdempotencyReplay(idempotencyKey, request);
      if (replay.kind === "conflict") {
        return c.json(
          { detail: "Idempotency key reused with different parameters" },
          409
        );
      }
      if (replay.kind === "replay") return c.json(replay.body, 201);
      requestHash = replay.requestHash;
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
        storeIdempotencyResult(
          idempotencyKey,
          requestHash,
          201,
          checkout
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
      const replay = findIdempotencyReplay(idempotencyKey, updateRequest);
      if (replay.kind === "conflict") {
        return c.json(
          { detail: "Idempotency key reused with different parameters" },
          409
        );
      }
      if (replay.kind === "replay") return c.json(replay.body, 200);
      requestHash = replay.requestHash;
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
        storeIdempotencyResult(
          idempotencyKey,
          requestHash,
          200,
          existing
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
      const replay = findIdempotencyReplay(idempotencyKey, rawBody);
      if (replay.kind === "conflict") {
        return c.json(
          { detail: "Idempotency key reused with different parameters" },
          409
        );
      }
      if (replay.kind === "replay") return c.json(replay.body, 200);
      requestHash = replay.requestHash;
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
    const totalAmount =
      checkout.totals?.find((total) => total.type === "total")?.amount ??
      checkout.totals?.find((total) => total.type === "subtotal")?.amount;
    if (totalAmount === undefined) {
      return c.json(
        { detail: "Checkout has no total; it cannot be completed." },
        400,
      );
    }

    const amountDue = minorUnits(totalAmount);
    const attempt = new PaymentAttempt();
    const reservation = new InventoryReservation();
    const instruments = payment.instruments;

    const failPayment = async (failure: PaymentFailure) => {
      await attempt.rollback();
      return c.json(
        failure.code
          ? { detail: failure.detail, code: failure.code }
          : { detail: failure.detail },
        failure.status,
      );
    };

    try {
      const giftCardFailure = await attempt.drawGiftCards(
        instruments,
        amountDue,
      );
      if (giftCardFailure) return failPayment(giftCardFailure);

      const selectedInstrument = instruments.find(
        (instrument: { type?: string }) => instrument?.type !== "gift_card",
      );
      if (selectedInstrument) {
        const authorizationFailure = await attempt.authorize(
          selectedInstrument,
          amountDue,
          checkout,
        );
        if (authorizationFailure) return failPayment(authorizationFailure);
      }

      const unavailableProduct = reservation.reserve(checkout);
      if (unavailableProduct) {
        return failPayment({
          detail: `Item ${unavailableProduct} is out of stock`,
          status: 409,
        });
      }

      checkout.status = CheckoutResponseStatusSchema.enum.completed;
      const order = constructOrder(checkout);

      const capture = await attempt.capture();
      if (capture.kind === "indeterminate") {
        return c.json(
          capture.code
            ? { detail: capture.detail, code: capture.code }
            : { detail: capture.detail },
          502,
        );
      }
      if (capture.kind === "failed") {
        reservation.release();
        return failPayment(capture.failure);
      }

      saveOrder(order.id, order);
      checkout.order = {
        id: order.id,
        permalink_url: order.permalink_url,
      };
      saveCheckout(id, checkout.status, checkout);
      reservation.commit();

      await this.notifyWebhook(checkout, "order_placed").catch((error) =>
        console.error("Webhook notify failed after order placed", error),
      );

      if (idempotencyKey) {
        storeIdempotencyResult(
          idempotencyKey,
          requestHash,
          200,
          checkout,
        );
      }

      return c.json(checkout, 200);
    } catch (error) {
      console.error("Error completing checkout", error);
      if (!attempt.hasCapturedCard) reservation.release();
      await attempt.rollback();
      return c.json({ detail: "Internal server error" }, 500);
    }
  };

  cancelCheckout = async (c: IdParamContext) => {
    const { id } = c.req.valid("param");
    const idempotencyKey = c.req.header("Idempotency-Key");
    const rawBody = {}; // Empty body for cancel usually
    let requestHash = "";

    if (idempotencyKey) {
      const replay = findIdempotencyReplay(idempotencyKey, rawBody);
      if (replay.kind === "conflict") {
        return c.json(
          { detail: "Idempotency key reused with different parameters" },
          409
        );
      }
      if (replay.kind === "replay") return c.json(replay.body, 200);
      requestHash = replay.requestHash;
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
      storeIdempotencyResult(
        idempotencyKey,
        requestHash,
        200,
        checkout
      );
    }

    return c.json(checkout, 200);
  };

  shipOrder = async (orderId: string): Promise<void> => {
    const order = getOrder(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    recordShipment(order);

    saveOrder(order.id, order);

    const checkout = getCheckoutSession(order.checkout_id);
    if (checkout) {
      await this.notifyWebhook(checkout, "order_shipped");
    }
  };
}
