/**
 * The consent-aware run orchestrator — M3.
 *
 * M2's `runPayment` (in `planner.ts`) settles a destination in one shot with an unsigned mandate and
 * a spend-cap-only gate. This wraps that flow with the M3 consent layer without disturbing the
 * planner's destination-independence:
 *
 *  - **Policy gate.** It loads the user's signed IntentMandate (spend cap + destination allowlist +
 *    expiry) and evaluates the discovered amount against it *before any instrument is touched*. Over
 *    the cap, or a destination not on the allowlist, raises an approval and halts — nothing is drawn.
 *  - **Audit trail.** Every step is appended to the append-only `run_events` trail, and the signed
 *    mandates are persisted, so the dashboard can show exactly what was authorized and what happened.
 *  - **Signed mandates.** It issues a CheckoutMandate (a hash of the checkout state) and a
 *    PaymentMandate (the instrument mix) as genuine EdDSA JWS, self-verifies them, and binds the
 *    payment to the checkout — the mechanical "amount moved after the quote" defence.
 *
 * The planner still decides the mix from `capabilities()` alone; this file adds consent *around* it.
 * Reaching a destination is still HTTP-only via its adapter; the only persistence here is the agent's
 * own consent store (its runs/approvals/audit), never the merchant's — that stays behind HTTP.
 */
import type { ConsentStore, ApprovalReason, Run } from "@pay-agent/db";
import {
  issueCheckoutMandate,
  issuePaymentMandate,
  issuePaymentToken,
  redeemPaymentToken,
  SpentTokens,
  verifyCheckoutMandate,
  verifyIntentMandate,
  verifyPaymentAgainstCheckout,
  type IssuerKey,
  type IntentClaims,
  type MandateInstrument,
  type SignedMandate,
} from "@pay-agent/mandate";

import type { AmountDue, Funding, Mandate, PaymentDestination, PaymentResult, PaymentStatus } from "./destination.js";
import { formatMinor } from "./money.js";
import { planInstruments } from "./planner.js";

export interface OrchestratorDeps {
  readonly destination: PaymentDestination;
  readonly funding: Funding;
  readonly consent: ConsentStore;
  readonly issuerKey: IssuerKey;
}

export interface PolicyContext {
  readonly userId: string;
  /** The user's standing authorization — a signed IntentMandate. */
  readonly intent: SignedMandate<IntentClaims>;
}

export type RunOutcome =
  | { readonly status: "pending_approval"; readonly run: Run; readonly detail: string }
  | { readonly status: "denied"; readonly run: Run }
  | { readonly status: "settled"; readonly run: Run; readonly result: PaymentResult; readonly confirmation: PaymentStatus }
  | { readonly status: "failed"; readonly run: Run; readonly result: PaymentResult };

/** The policy verdict, computed from the verified intent and the discovered amount. */
function evaluatePolicy(
  intent: IntentClaims,
  due: AmountDue,
): { readonly ok: boolean; readonly reasons: ApprovalReason[]; readonly detail: string } {
  const reasons: ApprovalReason[] = [];
  const notes: string[] = [];

  if (due.currency !== intent.currency) {
    reasons.push("currency_mismatch");
    notes.push(`owed in ${due.currency}, intent authorizes ${intent.currency}`);
  }
  if (due.amountMinor > intent.spendCapMinor) {
    reasons.push("over_cap");
    notes.push(
      `${formatMinor(due.amountMinor, due.currency)} exceeds the ` +
        `${formatMinor(intent.spendCapMinor, intent.currency)} spend cap`,
    );
  }
  if (!intent.destinationAllowlist.includes(due.destinationId)) {
    reasons.push("destination_not_allowlisted");
    notes.push(`destination "${due.destinationId}" is not on the intent's allowlist`);
  }

  return { ok: reasons.length === 0, reasons, detail: notes.join("; ") };
}

/**
 * Begin a run: discover, verify the intent, run the policy gate, and either halt for approval or
 * settle. A halted run persists everything it needs to be resumed by `resumeRun` once a human decides.
 */
export async function startRun(
  reference: string,
  deps: OrchestratorDeps,
  policy: PolicyContext,
): Promise<RunOutcome> {
  const { destination, consent, issuerKey } = deps;

  const due = await destination.discover(reference);
  const run = await consent.createRun({
    userId: policy.userId,
    reference: due.reference,
    destinationId: due.destinationId,
    amountMinor: due.amountMinor,
    currency: due.currency,
    description: due.description,
  });
  await consent.appendEvent(run.id, "discovered", `Discovered ${due.description}: ${formatMinor(due.amountMinor, due.currency)}`, {
    amountMinor: due.amountMinor,
    currency: due.currency,
  });

  // Verify the user's standing authorization before trusting any field on it.
  const intent = verifyIntentMandate(policy.intent.jws, issuerKey.publicKey);
  await consent.recordMandate({ jti: intent.jti, runId: run.id, kind: "IntentMandate", jws: policy.intent.jws, kid: policy.intent.kid });
  await consent.appendEvent(run.id, "mandate_verified", `Verified IntentMandate: cap ${formatMinor(intent.spendCapMinor, intent.currency)}, allowlist [${intent.destinationAllowlist.join(", ")}]`);

  // Policy gate — before any capabilities call or instrument work.
  const verdict = evaluatePolicy(intent, due);
  if (!verdict.ok) {
    await consent.setRunStatus(run.id, "pending_approval");
    await consent.appendEvent(run.id, "policy_blocked", `Policy blocked the run: ${verdict.detail}`, { reasons: verdict.reasons });
    await consent.requestApproval({ runId: run.id, reasons: verdict.reasons, detail: verdict.detail, capMinor: intent.spendCapMinor });
    await consent.appendEvent(run.id, "approval_requested", "Raised an approval request; halted with nothing drawn.");
    return { status: "pending_approval", run: (await consent.getRun(run.id)) as Run, detail: verdict.detail };
  }
  await consent.appendEvent(run.id, "policy_passed", "Within the spend cap and destination allowlisted.");

  return settle(run.id, due, deps, policy);
}

/**
 * Resume a run a human approved. Re-discovers the amount and refuses if it moved from what was
 * approved — an amount that changed after the human agreed is not the amount they agreed to.
 */
export async function resumeRun(runId: string, deps: OrchestratorDeps, policy: PolicyContext): Promise<RunOutcome> {
  const { destination, consent } = deps;
  const run = await consent.getRun(runId);
  if (!run) throw new Error(`no such run ${runId}`);

  const approval = await consent.getApproval(runId);
  if (!approval || approval.status !== "granted") {
    return { status: "pending_approval", run, detail: "still awaiting a human decision" };
  }
  // The grant itself is recorded where the decision was made; here we only mark that settlement is
  // resuming, so the trail reads "approved → resuming → …" without a duplicated approval row.
  await consent.appendEvent(runId, "info", `Resuming settlement after approval by ${approval.decidedBy ?? "a reviewer"}.`);

  const due = await destination.discover(run.reference);
  if (due.amountMinor !== run.amountMinor) {
    // The amount moved after the human approved a specific figure. Refuse and re-request.
    await consent.setRunStatus(runId, "pending_approval");
    const detail = `amount changed from ${formatMinor(run.amountMinor, run.currency)} to ${formatMinor(due.amountMinor, due.currency)} after approval`;
    await consent.appendEvent(runId, "policy_blocked", detail, { was: run.amountMinor, now: due.amountMinor });
    await consent.requestApproval({ runId, reasons: ["over_cap"], detail, capMinor: approval.capMinor });
    return { status: "pending_approval", run: (await consent.getRun(runId)) as Run, detail };
  }

  await consent.setRunStatus(runId, "approved");
  return settle(runId, due, deps, policy);
}

/** Issue the signed mandates, exchange a scoped token, settle the mix on the destination, and confirm. */
async function settle(runId: string, due: AmountDue, deps: OrchestratorDeps, policy: PolicyContext): Promise<RunOutcome> {
  const { destination, funding, consent, issuerKey } = deps;

  const capabilities = await destination.capabilities();
  const plan = planInstruments(due, capabilities, funding);
  await consent.appendEvent(
    runId,
    "planned",
    `Plan: gift ${formatMinor(plan.giftDrawMinor, plan.currency)}, card ${formatMinor(plan.cardMinor, plan.currency)}` +
      (plan.uncoveredMinor > 0 ? `, UNCOVERED ${formatMinor(plan.uncoveredMinor, plan.currency)}` : ""),
    { giftDrawMinor: plan.giftDrawMinor, cardMinor: plan.cardMinor, uncoveredMinor: plan.uncoveredMinor },
  );

  if (plan.uncoveredMinor > 0) {
    await consent.setRunStatus(runId, "pending_approval");
    const detail = `${formatMinor(plan.uncoveredMinor, plan.currency)} is covered by no instrument the agent holds`;
    await consent.appendEvent(runId, "policy_blocked", detail, { reasons: ["uncovered"] });
    await consent.requestApproval({ runId, reasons: ["uncovered"], detail });
    return { status: "pending_approval", run: (await consent.getRun(runId)) as Run, detail };
  }

  // CheckoutMandate — a hash of the exact checkout state.
  const checkoutState = { reference: due.reference, destinationId: due.destinationId, amountMinor: due.amountMinor, currency: due.currency };
  const checkout = issueCheckoutMandate({ reference: due.reference, destinationId: due.destinationId, amountMinor: due.amountMinor, currency: due.currency, checkoutState }, issuerKey);
  await consent.recordMandate({ jti: checkout.claims.jti, runId, kind: "CheckoutMandate", jws: checkout.jws, kid: checkout.kid });
  const checkoutClaims = verifyCheckoutMandate(checkout.jws, issuerKey.publicKey);
  await consent.appendEvent(runId, "mandate_issued", `Issued CheckoutMandate (hash ${checkoutClaims.checkoutHash.slice(0, 12)}…), signed EdDSA.`);

  // PaymentMandate — the instrument mix, bound to the checkout.
  const instruments: MandateInstrument[] = [];
  if (plan.giftDrawMinor > 0) instruments.push({ type: "gift_card" });
  if (plan.cardMinor > 0) instruments.push({ type: "card", amountMinor: plan.cardMinor });
  const payment = issuePaymentMandate({ reference: due.reference, destinationId: due.destinationId, amountMinor: due.amountMinor, currency: due.currency, checkoutMandate: checkout, instruments }, issuerKey);
  await consent.recordMandate({ jti: payment.claims.jti, runId, kind: "PaymentMandate", jws: payment.jws, kid: payment.kid });
  verifyPaymentAgainstCheckout(payment.jws, checkoutClaims, issuerKey.publicKey);
  await consent.appendEvent(runId, "mandate_verified", "Verified PaymentMandate binds to the CheckoutMandate (amount, currency, destination).");

  // Scoped-payment-token exchange — the card rail's credential.
  //
  // Where there is a card leg, the agent exchanges the signed PaymentMandate for a narrowly scoped,
  // single-use token bound to *this* destination and the authorized amount, and redeems it once right
  // before settling. This is the pattern ACP and Stripe's Shared Payment Tokens define. The token
  // here is our own EdDSA-JWS token (verified as ours): Stripe's *issued* Shared Payment Token would
  // be minted at exactly this point for a Stripe-backed destination whose account has the feature —
  // it is not enabled on this test account (`GET /v1/shared_payment/granted_tokens` → "Unrecognized
  // request URL"), so we mint the equivalent and label it honestly. `docs/DESIGN.md` records the gap.
  if (plan.cardMinor > 0 && plan.card) {
    const token = issuePaymentToken(
      { userId: policy.userId, destinationId: due.destinationId, amountMinor: due.amountMinor, currency: due.currency, ttlSeconds: 300, paymentMandateJti: payment.claims.jti },
      issuerKey,
    );
    await consent.appendEvent(
      runId,
      "info",
      `Exchanged the PaymentMandate for a scoped payment token — single-use, bound to ${due.destinationId} · ${formatMinor(due.amountMinor, due.currency)} (our own token; Stripe's issued Shared Payment Token where the account has it).`,
      { jti: token.claims.jti },
    );
    // Redeem it once against this exact context — a token minted for another destination or amount
    // would be refused here (the bind demos exercise those refusals directly).
    redeemPaymentToken(
      token.jws,
      issuerKey.publicKey,
      { destinationId: due.destinationId, amountMinor: due.amountMinor, currency: due.currency },
      new SpentTokens(),
    );
    await consent.appendEvent(runId, "info", "Scoped token verified and redeemed once for this settlement.");
  }

  const transport: Mandate = {
    reference: due.reference,
    destinationId: due.destinationId,
    amountMinor: due.amountMinor,
    currency: due.currency,
    createdAt: new Date().toISOString(),
    signed: true,
    jws: payment.jws,
    kid: payment.kid,
  };

  const result = await destination.pay(plan, transport, due);

  if (result.giftDrawnMinor && result.giftDrawnMinor > 0) {
    await consent.appendEvent(runId, "gift_drawn", `Drew ${formatMinor(result.giftDrawnMinor, due.currency)} from the gift card.`, { amountMinor: result.giftDrawnMinor });
  }
  if (result.cardChargedMinor && result.cardChargedMinor > 0) {
    await consent.appendEvent(runId, "card_charged", `Authorized ${formatMinor(result.cardChargedMinor, due.currency)} on the card rail.`, { amountMinor: result.cardChargedMinor });
  }
  if (result.reversed) {
    await consent.appendEvent(runId, "gift_reversed", "Payment failed after a draw — the gift-card draw was reversed exactly.");
  }

  if (!result.ok) {
    await consent.appendEvent(runId, "failed", `Payment failed: ${result.detail}`);
    await consent.setRunStatus(runId, "failed");
    return { status: "failed", run: (await consent.getRun(runId)) as Run, result };
  }

  // Build the paid summary from the amounts we hold, formatted — never echo the adapter's raw
  // `detail`, which carries minor-unit integers (e.g. "settled 2599 …") that must not reach a screen.
  const paidParts: string[] = [];
  if (result.giftDrawnMinor && result.giftDrawnMinor > 0) paidParts.push(`${formatMinor(result.giftDrawnMinor, due.currency)} gift card`);
  if (result.cardChargedMinor && result.cardChargedMinor > 0) paidParts.push(`${formatMinor(result.cardChargedMinor, due.currency)} card`);
  const paidSummary = paidParts.length > 0 ? `Paid — ${paidParts.join(" + ")}.` : "Paid — the gift card covered it in full.";
  await consent.appendEvent(runId, "paid", paidSummary, { detail: result.detail, handle: result.handle });
  // The payment executed (result.ok), so the run is settled — money moved. `confirm` is an
  // independent re-check recorded verbatim in the trail, not a status flip: a payment that genuinely
  // settled must not be re-labelled "failed" just because a read-back could not corroborate it.
  const confirmation = await destination.confirm(result.handle);
  await consent.appendEvent(runId, "confirmed", `Destination confirmation: ${confirmation.settled ? "settled" : "could not corroborate"} (${confirmation.detail})`);
  await consent.setRunStatus(runId, "settled");

  return { status: "settled", run: (await consent.getRun(runId)) as Run, result, confirmation };
}
