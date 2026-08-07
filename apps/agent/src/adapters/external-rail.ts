/**
 * Shared settlement for external-rail destinations.
 *
 * Two destinations — a Stripe payment link and the StreamCo biller — are *external rails*: neither
 * issued our closed-loop gift card, so neither can redeem it. For both, the split happens on our
 * side in exactly the same way: draw the gift card on our own store's ledger first, settle the
 * remainder as a genuine test-mode Stripe PaymentIntent, and if that card leg declines, reverse the
 * draw so the balance lands to the cent. Only *discovery* differs between them (read a Stripe link
 * vs. scrape a page), so that difference lives in each adapter and this settlement spine is shared.
 *
 * The failure-safety contract is the load-bearing part and is identical to the storefront's:
 *  - a definite decline reverses the gift draw;
 *  - an *indeterminate* transport error (Stripe may have captured, only the response was lost) does
 *    NOT reverse — a stuck-but-recoverable draw beats a refunded gift beside a charged card;
 *  - the reversible run id is minted before any draw, so a redeem whose response is lost is still
 *    reversible by that id.
 */
import { randomUUID } from "node:crypto";

import Stripe from "stripe";

import type { AmountDue, InstrumentPlan, PaymentResult } from "../destination.js";
import type { Minor } from "../money.js";

/** Draw the gift card on our ledger under a caller-supplied run id; returns what was actually drawn. */
async function redeemGift(
  storeBase: string,
  gift: { code: string; pin: string },
  amountMinor: Minor,
  runId: string,
): Promise<Minor> {
  const res = await fetch(`${storeBase}/funding/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: gift.code, pin: gift.pin, amount_minor: amountMinor, run_id: runId }),
  });
  const body = (await res.json()) as { drawn_minor?: number; detail?: string };
  if (!res.ok) throw new Error(body.detail ?? `gift-card redeem failed (${res.status})`);
  return body.drawn_minor ?? 0;
}

/** Hand a drawn run back. Returns whether the reversal actually succeeded — never assumed. */
async function reverseGift(storeBase: string, runId: string): Promise<boolean> {
  try {
    const res = await fetch(`${storeBase}/funding/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ExternalRailSettlement {
  readonly result: PaymentResult;
  /** The reversible run id minted for this settlement, so a caller can reconcile a stuck draw. */
  readonly runId: string | null;
}

/**
 * Settle `plan` against an external rail: gift draw on our ledger, remainder on the card, reverse on
 * a definite decline. `metadata` is attached to the PaymentIntent for the audit trail. The result's
 * `handle` is the PaymentIntent id, or the run id when the gift card covered the whole bill.
 */
export async function settleExternalRail(opts: {
  stripe: Stripe;
  storeBase: string;
  plan: InstrumentPlan;
  due: AmountDue;
  metadata: Record<string, string>;
}): Promise<ExternalRailSettlement> {
  const { stripe, storeBase, plan, due } = opts;
  const gift = plan.giftDrawMinor > 0 ? plan.giftCard : null;
  const giftRunId = gift ? `agent_${randomUUID()}` : null;
  let attemptedDraw = false;
  let giftDrawn: Minor = 0;

  const failReversed = async (detail: string): Promise<ExternalRailSettlement> => {
    let reversed = false;
    if (attemptedDraw && giftRunId) reversed = await reverseGift(storeBase, giftRunId);
    return {
      runId: giftRunId,
      result: {
        ok: false,
        handle: "",
        detail:
          attemptedDraw && !reversed
            ? `${detail} — WARNING: gift draw ${giftRunId} could NOT be reversed; run left open`
            : detail,
        giftDrawnMinor: null,
        cardChargedMinor: null,
        reversed,
      },
    };
  };

  try {
    if (gift && giftRunId) {
      attemptedDraw = true;
      giftDrawn = await redeemGift(storeBase, gift, plan.giftDrawMinor, giftRunId);
    }

    // Reconcile the card leg against what the gift card ACTUALLY drew, not the plan's estimate: a
    // stale-high hint draws less, so the card must cover the true remainder (still bounded by the
    // amount due, which is what the mandate authorized). Charging the plan's estimate would underpay.
    const cardAmount = due.amountMinor - giftDrawn;

    if (cardAmount <= 0) {
      return {
        runId: giftRunId,
        result: {
          ok: true,
          handle: giftRunId ?? "gift-only",
          detail: `gift card covered the whole ${due.description}`,
          giftDrawnMinor: giftDrawn > 0 ? giftDrawn : null,
          cardChargedMinor: 0,
          reversed: false,
        },
      };
    }

    if (!plan.card) {
      return failReversed(`${cardAmount} remained after the gift card and no card was granted`);
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: cardAmount,
        currency: due.currency.toLowerCase(),
        payment_method: plan.card.token,
        confirm: true,
        off_session: true,
        metadata: { ...opts.metadata, run_id: giftRunId ?? "none" },
      },
      { idempotencyKey: `${giftRunId ?? randomUUID()}:${cardAmount}` },
    );

    if (intent.status !== "succeeded") {
      return failReversed(`card authorization did not settle (status: ${intent.status})`);
    }

    return {
      runId: giftRunId,
      result: {
        ok: true,
        handle: intent.id,
        detail: `settled ${cardAmount} on ${intent.id}`,
        giftDrawnMinor: giftDrawn > 0 ? giftDrawn : null,
        cardChargedMinor: cardAmount,
        reversed: false,
      },
    };
  } catch (err) {
    if (
      err instanceof Stripe.errors.StripeConnectionError ||
      err instanceof Stripe.errors.StripeAPIError
    ) {
      return {
        runId: giftRunId,
        result: {
          ok: false,
          handle: "",
          detail:
            `indeterminate: the card charge may or may not have settled (${err.message})` +
            (attemptedDraw
              ? `; gift draw ${giftRunId} left in place pending reconciliation — do not retry blindly`
              : ""),
          giftDrawnMinor: attemptedDraw ? giftDrawn : null,
          cardChargedMinor: null,
          reversed: false,
        },
      };
    }
    const detail =
      err instanceof Stripe.errors.StripeError
        ? `${err.code ?? err.type}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return failReversed(detail);
  }
}
