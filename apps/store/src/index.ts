/** Composes the Hono store application, middleware, services, and HTTP routes. */

import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { requestId } from "hono/request-id";
import { pinoHttp } from "pino-http";

import { CatalogService } from "./api/catalog";
import { CheckoutService } from "./api/checkout";
import { DiscoveryService } from "./api/discovery";
import { FundingService } from "./api/funding";
import { OrderService } from "./api/order";
import { TestingService } from "./api/testing";
import { initDbs } from "./data/db";
import {
  ExtendedCheckoutCreateRequestSchema,
  ExtendedCheckoutUpdateRequestSchema,
  CheckoutCompleteRequestSchema,
  OrderSchema,
} from "./models";
import { assertSafeStripeConfig } from "./payments/stripe";
import { IdParamSchema, prettyValidation } from "./utils/validation";

/**
 * Before anything else, and before any port is bound.
 *
 * A deployed build refuses to start when a live Stripe key is present. Making that a
 * startup failure rather than a runtime check is the point: there is no request to get
 * wrong, no branch to forget, and the demo cannot quietly come up in a state where a public
 * URL sits in front of live card rails.
 */
assertSafeStripeConfig();

const app = new Hono();

initDbs("databases/products.db", "databases/transactions.db");

const checkoutService = new CheckoutService();
const orderService = new OrderService();
const discoveryService = new DiscoveryService();
const catalogService = new CatalogService();
const fundingService = new FundingService();
const testingService = new TestingService(checkoutService);

// Setup logging for each request
app.use(requestId());
app.use(async (c: Context, next: () => Promise<void>) => {
  c.env.incoming.id = c.var.requestId;

  await new Promise<void>((resolve) =>
    pinoHttp({
      quietReqLogger: true,
      transport: {
        target: "pino-http-print",
        options: {
          destination: 1,
          all: true,
          translateTime: true,
        },
      },
    })(c.env.incoming, c.env.outgoing, () => resolve())
  );

  c.set("logger", c.env.incoming.log);

  await next();
});

// Middleware for Version Negotiation
app.use(async (c: Context, next: () => Promise<void>) => {
  const ucpAgent = c.req.header("UCP-Agent");
  if (ucpAgent) {
    // Simple regex to find version="YYYY-MM-DD"
    const match = ucpAgent.match(/version="([^"]+)"/);
    if (match) {
      const clientVersion = match[1];
      const serverVersion = discoveryService.ucpVersion;
      // Simple string comparison for now, assuming ISO dates.
      // Ideally we'd parse and check compatibility.
      if (clientVersion > serverVersion) {
        return c.json(
          {
            ucp: {
              version: serverVersion,
              status: "error",
            },
            messages: [
              {
                type: "error",
                code: "VERSION_UNSUPPORTED",
                content: `Version ${clientVersion} is not supported. This merchant implements version ${serverVersion}.`,
                severity: "unrecoverable",
              },
            ],
          },
          422
        );
      }
    }
  }
  await next();
});

/* Discovery endpoints */
app.get("/.well-known/ucp", discoveryService.getMerchantProfile);

/* Catalogue — the human storefront's browse surface, not part of the UCP agent contract. */
app.get("/products", catalogService.listProducts);

/* Checkout Capability endpoints */
app.post(
  "/checkout-sessions",
  zValidator("json", ExtendedCheckoutCreateRequestSchema, prettyValidation),
  checkoutService.createCheckout
);
app.get(
  "/checkout-sessions/:id",
  zValidator("param", IdParamSchema, prettyValidation),
  checkoutService.getCheckout
);
app.put(
  "/checkout-sessions/:id",
  zValidator("param", IdParamSchema, prettyValidation),
  zValidator("json", ExtendedCheckoutUpdateRequestSchema, prettyValidation),
  checkoutService.updateCheckout
);
app.post(
  "/checkout-sessions/:id/complete",
  zValidator("param", IdParamSchema, prettyValidation),
  zValidator("json", CheckoutCompleteRequestSchema, prettyValidation),
  checkoutService.completeCheckout
);
app.post(
  "/checkout-sessions/:id/cancel",
  zValidator("param", IdParamSchema, prettyValidation),
  checkoutService.cancelCheckout
);

/* Order Capability endpoints */
app.get(
  "/orders/:id",
  zValidator("param", IdParamSchema, prettyValidation),
  orderService.getOrder
);
app.put(
  "/orders/:id",
  zValidator("param", IdParamSchema, prettyValidation),
  zValidator("json", OrderSchema, prettyValidation),
  orderService.updateOrder
);

/* Funding endpoints — the merchant-side surface, not part of the UCP contract.
   An agent never touches these: enrolling a card is something the *user* does, once,
   before any agent is asked to spend from it. */
app.get("/enroll", fundingService.getEnrollPage);
app.post("/funding/setup-intents", fundingService.createSetupIntent);
app.post("/funding/cards", fundingService.enrollOpenLoopCard);
app.get("/funding/cards", fundingService.listCards);
/* Standalone gift-card draw + reversal, for splitting against an external destination's rail:
   the agent draws our closed-loop card here, pays the remainder on the destination, and reverses
   this draw if that leg fails. The store's own checkout still redeems gift cards inline. */
app.post("/funding/redeem", fundingService.redeem);
app.post("/funding/reverse", fundingService.reverse);

/* Testing endpoints */
app.post(
  "/testing/simulate-shipping/:id",
  zValidator("param", IdParamSchema, prettyValidation),
  testingService.shipOrder
);

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
