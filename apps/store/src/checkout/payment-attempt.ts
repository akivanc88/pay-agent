/** Coordinates ordered payment legs, commit state, and idempotent compensation. */

import { v4 as uuidv4 } from "uuid";
import type Stripe from "stripe";
import type { MinorUnits } from "@pay-agent/db";

import type {
  ExtendedCheckoutResponse,
  PaymentCreateRequest,
} from "../models";
import { ExtendedPaymentCredentialSchema } from "../models";
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

type Instrument = NonNullable<PaymentCreateRequest["instruments"]>[number];

export interface PaymentFailure {
  detail: string;
  status: 400 | 402 | 403 | 409;
  code?: string;
}

export type CaptureResult =
  | { kind: "captured" }
  | { kind: "failed"; failure: PaymentFailure }
  | { kind: "indeterminate"; detail: string; code?: string };

export class PaymentAttempt {
  readonly runId = `run_${uuidv4()}`;
  private settlement?: SettlementResult;
  private stripe: Stripe | null = null;
  private authorization?: Authorization;
  private rolledBack = false;
  private captured = false;

  get remaining(): number | undefined {
    return this.settlement?.remaining;
  }

  get hasCapturedCard(): boolean {
    return this.captured;
  }

  async drawGiftCards(
    instruments: Instrument[],
    amountDue: MinorUnits,
  ): Promise<PaymentFailure | undefined> {
    if (!instruments.some((instrument) => instrument?.type === "gift_card")) {
      return undefined;
    }

    try {
      this.settlement = await settleGiftCards(instruments, amountDue, this.runId);
    } catch (error) {
      await reverseSettlement(this.runId).catch(() => undefined);
      this.rolledBack = true;
      if (error instanceof GiftCardError) {
        return { detail: error.message, status: error.status };
      }
      throw error;
    }

    const hasOtherInstrument = instruments.some(
      (instrument) => instrument?.type !== "gift_card",
    );
    if (this.settlement.remaining > 0 && !hasOtherInstrument) {
      const { covered, remaining } = this.settlement;
      await this.rollback();
      return {
        detail:
          `Gift cards covered ${covered} of ${amountDue}; ` +
          `${remaining} remains and no other payment instrument was supplied`,
        status: 402,
        code: "insufficient_funds",
      };
    }
    return undefined;
  }

  async authorize(
    instrument: Instrument,
    amountDue: MinorUnits,
    checkout: ExtendedCheckoutResponse,
  ): Promise<PaymentFailure | undefined> {
    const credential = instrument.credential;
    if (!credential) return { detail: "Missing credentials in instrument", status: 400 };

    if (instrument.handler_id === STRIPE_HANDLER_ID) {
      const amount = this.settlement ? this.settlement.remaining : amountDue;
      const parsedCredential = ExtendedPaymentCredentialSchema.safeParse(credential);
      const paymentMethodId = parsedCredential.success
        ? parsedCredential.data.token
        : undefined;
      if (!paymentMethodId?.startsWith("pm_")) {
        return {
          detail:
            "Stripe instrument requires a PaymentMethod id (pm_…) as its credential token",
          status: 400,
        };
      }
      if (amount === 0) return undefined;

      this.stripe = testClient();
      if (!this.stripe) {
        return {
          detail: "Stripe handler requested but STRIPE_SECRET_KEY is not configured",
          status: 400,
        };
      }
      const outcome = await authorizeCard({
        stripe: this.stripe,
        paymentMethodId,
        amount,
        currency: checkout.currency,
        runId: this.runId,
        checkoutId: checkout.id,
      });
      if (!outcome.ok) {
        return {
          detail: `Card authorization failed: ${outcome.message}`,
          status: outcome.indeterminate ? 402 : outcome.status,
          code: outcome.code,
        };
      }
      this.authorization = outcome.authorization;
      return undefined;
    }

    if (instrument.type === "card" && credential.type === "card") return undefined;

    const parsedCredential = ExtendedPaymentCredentialSchema.safeParse(credential);
    const token = parsedCredential.success ? parsedCredential.data.token : undefined;
    const handlerId = instrument.handler_id;
    if (handlerId === "mock_payment_handler") {
      if (token === "success_token") return undefined;
      if (token === "fail_token") {
        return { detail: "Payment Failed: Insufficient Funds (Mock)", status: 402 };
      }
      if (token === "fraud_token") {
        return { detail: "Payment Failed: Fraud Detected (Mock)", status: 403 };
      }
      return { detail: `Unknown mock token: ${token}`, status: 400 };
    }
    if (handlerId === "google_pay" || handlerId === "gpay" || handlerId === "shop_pay") {
      return undefined;
    }
    return { detail: `Unsupported payment handler: ${handlerId}`, status: 400 };
  }

  async capture(): Promise<CaptureResult> {
    if (!this.stripe || !this.authorization) return { kind: "captured" };
    const captured = await captureAuthorization(this.stripe, this.authorization);
    if (!captured.ok) {
      if (captured.indeterminate) {
        return {
          kind: "indeterminate",
          detail:
            `Card capture is indeterminate; the charge may or may not have settled ` +
            `(${captured.message}). No order was placed and nothing was reversed — verify ` +
            `before retrying.`,
          code: captured.code,
        };
      }
      return {
        kind: "failed",
        failure: {
          detail: `Card capture failed: ${captured.message}`,
          status: captured.status,
          code: captured.code,
        },
      };
    }
    this.captured = true;
    return { kind: "captured" };
  }

  async rollback(): Promise<void> {
    if (this.rolledBack || this.captured) return;
    this.rolledBack = true;
    if (this.stripe && this.authorization) {
      await cancelAuthorization(this.stripe, this.authorization).catch(() => undefined);
    }
    if (this.settlement) {
      await reverseSettlement(this.runId).catch(() => undefined);
    }
  }
}
