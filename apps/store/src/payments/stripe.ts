import Stripe from "stripe";

import { DEFAULT_CURRENCY, type MinorUnits } from "@pay-agent/db";

/**
 * The card rail, via Stripe.
 *
 * This is the other half of a split payment: gift cards are drawn against our own ledger,
 * and whatever they cannot cover is authorized here. Up to this point the non-gift-card leg
 * was upstream's mock token handler, which returns success for the string `success_token`
 * and proves nothing.
 *
 * Two properties of this module are load-bearing and are enforced mechanically rather than
 * by discipline, because both are the kind of mistake that is only noticed after real money
 * has moved:
 *
 * 1. **A live key can only ever arrive through `STRIPE_LIVE_SECRET_KEY`.** Putting one in
 *    `STRIPE_SECRET_KEY` is refused outright, so live mode cannot be entered by editing a
 *    value that every other part of the system already treats as test-mode.
 * 2. **A deployed build refuses to boot if a live key is present at all.** The hosted demo
 *    is test-mode only; a public URL and live card rails must never meet.
 *
 * Nothing here reaches the live path. M4's guarded decline builds on `liveClient()`, which
 * exists but is unreachable from checkout.
 */

/** Handler id advertised in `/.well-known/ucp` and echoed back on each instrument. */
export const STRIPE_HANDLER_ID = "stripe_payments";
export const STRIPE_HANDLER_NAME = "com.stripe.payments";

/**
 * Environments where a live key must not exist.
 *
 * `NODE_ENV` alone is not enough — a platform can run a production build without setting
 * it — so the common platform markers are checked too. Adding to this list is cheap; the
 * failure it prevents is not.
 */
const DEPLOYMENT_MARKERS = [
  "VERCEL",
  "RENDER",
  "FLY_APP_NAME",
  "RAILWAY_ENVIRONMENT",
  "K_SERVICE",
  "DYNO",
] as const;

export function isDeployedEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env["NODE_ENV"] === "production") return true;
  return DEPLOYMENT_MARKERS.some((marker) => Boolean(env[marker]));
}

export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

/**
 * Refuse to run in any configuration where live rails and the demo could meet.
 *
 * Called once at startup, and again by `testClient()`, so the guard holds whether the
 * process is the server or a script.
 */
export function assertSafeStripeConfig(env: NodeJS.ProcessEnv = process.env): void {
  const test = env["STRIPE_SECRET_KEY"];
  const live = env["STRIPE_LIVE_SECRET_KEY"];

  if (test?.startsWith("sk_live_")) {
    throw new StripeConfigError(
      "STRIPE_SECRET_KEY holds a live key. Live keys are read only from " +
        "STRIPE_LIVE_SECRET_KEY, never from a swapped test key.",
    );
  }

  if (live && isDeployedEnvironment(env)) {
    throw new StripeConfigError(
      "STRIPE_LIVE_SECRET_KEY is set in a deployed environment. The hosted demo is " +
        "test-mode only; the live decline runs on the laptop and nowhere else.",
    );
  }

  if (live && !live.startsWith("sk_live_")) {
    throw new StripeConfigError(
      "STRIPE_LIVE_SECRET_KEY does not hold a live key. Leave it unset rather than " +
        "pointing it at a test key — the live guards key off this variable.",
    );
  }
}

let client: Stripe | null = null;

/**
 * The test-mode Stripe client.
 *
 * Returns `null` when no key is configured, so the storefront still runs — and its tests
 * still pass — on a machine that has never seen a Stripe key. A checkout that actually
 * asks for the Stripe handler then fails loudly, which is the right time to find out.
 */
export function testClient(): Stripe | null {
  if (client) return client;

  assertSafeStripeConfig();
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return null;

  client = new Stripe(key, {
    // Named so a support request or a dashboard log can be traced back to this project.
    appInfo: { name: "pay-agent", url: "https://github.com/ashis-majumder/pay-agent" },
  });
  return client;
}

/**
 * The live client. Deliberately separate, deliberately unused by checkout.
 *
 * M4's one real transaction calls this directly, behind its own guard that refuses to run
 * unless the charge exceeds the enrolled balance. Keeping it out of the checkout path means
 * no request can reach it.
 */
export function liveClient(): Stripe {
  assertSafeStripeConfig();
  const key = process.env["STRIPE_LIVE_SECRET_KEY"];
  if (!key) {
    throw new StripeConfigError("STRIPE_LIVE_SECRET_KEY is not set");
  }
  return new Stripe(key, {
    appInfo: { name: "pay-agent (live)", url: "https://github.com/ashis-majumder/pay-agent" },
  });
}

/** Test seam — lets a test drive the checkout without reaching the network. */
export function setStripeClient(replacement: Stripe | null): void {
  client = replacement;
}

export interface Authorization {
  readonly paymentIntentId: string;
  readonly amount: MinorUnits;
  readonly currency: string;
}

export type AuthorizationOutcome =
  | { readonly ok: true; readonly authorization: Authorization }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly status: 400 | 402 };

/**
 * Authorize, but do not capture.
 *
 * The order does not exist yet at this point: stock still has to be reserved and the order
 * record written. Capturing here would mean a real charge could survive a checkout that
 * never completed — the exact failure the gift-card reversal exists to prevent, so the card
 * leg is held to the same standard. `capture_method: "manual"` makes the charge provisional
 * in the same way a gift-card draw is provisional, and `cancelAuthorization` undoes it.
 *
 * Amounts pass through untouched: Stripe counts in the smallest currency unit, which is
 * what `MinorUnits` already is.
 */
export async function authorizeCard(args: {
  readonly stripe: Stripe;
  readonly paymentMethodId: string;
  readonly amount: MinorUnits;
  readonly currency?: string;
  readonly runId: string;
  readonly checkoutId: string;
}): Promise<AuthorizationOutcome> {
  const currency = (args.currency ?? DEFAULT_CURRENCY).toLowerCase();

  try {
    const intent = await args.stripe.paymentIntents.create(
      {
        amount: args.amount,
        currency,
        payment_method: args.paymentMethodId,
        capture_method: "manual",
        confirm: true,
        // The buyer is not at a browser: an agent is completing this checkout on their
        // behalf. `off_session` is Stripe's own name for exactly that, and it is what makes
        // a decline here a genuine issuer decline rather than a skipped authentication step.
        off_session: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { run_id: args.runId, checkout_id: args.checkoutId },
      },
      // The run id keys the gift-card draws too, so a retried checkout cannot authorize
      // twice on one rail while reversing on the other.
      { idempotencyKey: `${args.runId}:authorize` },
    );

    if (intent.status !== "requires_capture") {
      return {
        ok: false,
        code: intent.status,
        message: `Card authorization was not completed (status: ${intent.status})`,
        status: 402,
      };
    }

    return {
      ok: true,
      authorization: {
        paymentIntentId: intent.id,
        amount: args.amount,
        currency,
      },
    };
  } catch (err) {
    return declineOutcome(err);
  }
}

/** Take the authorized money. Called only once the order is certain to exist. */
export async function captureAuthorization(
  stripe: Stripe,
  authorization: Authorization,
): Promise<AuthorizationOutcome> {
  try {
    const intent = await stripe.paymentIntents.capture(authorization.paymentIntentId);
    if (intent.status !== "succeeded") {
      return {
        ok: false,
        code: intent.status,
        message: `Card capture did not succeed (status: ${intent.status})`,
        status: 402,
      };
    }
    return { ok: true, authorization };
  } catch (err) {
    return declineOutcome(err);
  }
}

/**
 * Release an authorization that will never be captured.
 *
 * The card-rail counterpart of reversing a gift-card draw. Failures are swallowed for the
 * same reason the gift-card reversal swallows them: this runs on a path that is already
 * failing, and the buyer's error message must not be replaced by a second one. An
 * uncaptured authorization also expires on its own, so the worst case is a temporary hold
 * rather than a charge.
 */
export async function cancelAuthorization(
  stripe: Stripe,
  authorization: Authorization,
): Promise<void> {
  try {
    await stripe.paymentIntents.cancel(authorization.paymentIntentId);
  } catch (err) {
    console.warn(
      `Failed to cancel authorization ${authorization.paymentIntentId}; ` +
        `it will expire uncaptured. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Turn a Stripe error into a payment outcome.
 *
 * A card decline is a normal result, not an exception: the buyer's card said no, and the
 * checkout's job is to hand the gift-card money back and say so. Everything else — a bad
 * key, a malformed request — is our fault and is reported as such.
 */
function declineOutcome(err: unknown): AuthorizationOutcome {
  if (err instanceof Stripe.errors.StripeCardError) {
    return {
      ok: false,
      // `decline_code` is the issuer's reason (`insufficient_funds`); `code` is Stripe's
      // category (`card_declined`). The issuer's reason is the one worth reporting.
      code: err.decline_code ?? err.code ?? "card_declined",
      message: err.message,
      status: 402,
    };
  }

  if (err instanceof Stripe.errors.StripeError) {
    return {
      ok: false,
      code: err.code ?? err.type,
      message: err.message,
      status: 400,
    };
  }

  throw err;
}

/** The handler declaration advertised at `/.well-known/ucp`. */
export function stripeHandlerDeclaration(ucpVersion: string) {
  return {
    id: STRIPE_HANDLER_ID,
    name: STRIPE_HANDLER_NAME,
    version: ucpVersion,
    spec: "https://docs.stripe.com/agentic-commerce/ucp/stripe-payments-handler",
    config_schema: `https://ucp.dev/${ucpVersion}/schemas/shopping/checkout.json`,
    instrument_schemas: [
      `https://ucp.dev/${ucpVersion}/schemas/shopping/types/card_payment_instrument.json`,
    ],
    config: {
      currency: DEFAULT_CURRENCY,
      // Advertised only when a key is actually configured, so discovery describes what this
      // merchant can really do rather than what it was compiled to do.
      publishable_key: process.env["STRIPE_PUBLISHABLE_KEY"] ?? null,
      supported_instruments: ["card"],
      combinable: true,
    },
  };
}
