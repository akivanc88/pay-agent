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
  issueIntentMandate,
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
  | {
      readonly status: "settled";
      readonly run: Run;
      readonly result: PaymentResult;
      readonly confirmation: PaymentStatus;
      /**
       * When a human approved *with* standing authorization, the newly reissued IntentMandate — a
       * brand-new signed mandate (new jti, widened cap/allowlist, fresh expiry) that a future run can
       * present so the same recurring charge settles with no prompt. Absent on a plain one-time approve.
       */
      readonly reissuedIntent?: SignedMandate<IntentClaims>;
    }
  | { readonly status: "failed"; readonly run: Run; readonly result: PaymentResult };

/** How a human's approval decision may widen standing authorization. Never set by the model. */
export interface ResumeOptions {
  /**
   * The human, in the approval UI, chose "approve **and** trust this destination going forward". When
   * true, `resumeRun` reissues the run's gating IntentMandate — widened to cover this destination and
   * amount, with a fresh expiry — and persists it before settling. Opt-in and explicit: a plain
   * approve leaves this false and never widens the mandate. This flag is only ever plumbed from the
   * human approval surface; the brain's `resume_run` tool does not expose it (AGENTS.md rule 26).
   */
  readonly grantStandingAuth?: boolean;
}

/**
 * The policy verdict, computed from the verified intent, the discovered amount, and the total already
 * settled under this mandate. Pure and synchronous: the running total is looked up by `startRun` and
 * passed in, so this stays trivially testable and free of the store.
 */
function evaluatePolicy(
  intent: IntentClaims,
  due: AmountDue,
  settledTotalMinor: number,
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
  // Cumulative ceiling — opt-in. When set, a per-transaction-legal amount is still refused if it
  // would push the running total under this mandate past the budget. `>` not `>=`: spending exactly
  // to the cap is allowed; only crossing it halts.
  if (intent.cumulativeCapMinor !== undefined && settledTotalMinor + due.amountMinor > intent.cumulativeCapMinor) {
    reasons.push("over_cumulative_cap");
    notes.push(
      `${formatMinor(due.amountMinor, due.currency)} would bring spending under this authorization to ` +
        `${formatMinor(settledTotalMinor + due.amountMinor, intent.currency)}, over the ` +
        `${formatMinor(intent.cumulativeCapMinor, intent.currency)} cumulative cap ` +
        `(already ${formatMinor(settledTotalMinor, intent.currency)} settled)`,
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
  // Stamp this run's *gating* intent so the cumulative-cap sum can key off it.
  await consent.setRunIntentJti(run.id, intent.jti);
  await consent.appendEvent(
    run.id,
    "mandate_verified",
    `Verified IntentMandate: cap ${formatMinor(intent.spendCapMinor, intent.currency)}` +
      (intent.cumulativeCapMinor !== undefined ? `, cumulative ${formatMinor(intent.cumulativeCapMinor, intent.currency)}` : "") +
      `, allowlist [${intent.destinationAllowlist.join(", ")}]`,
  );

  // The running total already settled under this mandate — the cumulative gate compares against it.
  const settledTotalMinor = await consent.sumSettledAmountForMandate(intent.jti);
  if (intent.cumulativeCapMinor !== undefined) {
    await consent.appendEvent(
      run.id,
      "info",
      `Cumulative usage under this authorization: ${formatMinor(settledTotalMinor, intent.currency)} of ${formatMinor(intent.cumulativeCapMinor, intent.currency)} settled before this run.`,
      { settledTotalMinor, cumulativeCapMinor: intent.cumulativeCapMinor },
    );
  }

  // Policy gate — before any capabilities call or instrument work.
  const verdict = evaluatePolicy(intent, due, settledTotalMinor);
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
 *
 * `options.grantStandingAuth` carries the human's *separate, explicit* choice to also trust this
 * destination going forward: when set, and only after a human's grant is on record, the run's gating
 * IntentMandate is reissued (widened + fresh expiry) and persisted before settling. A plain approve
 * leaves it untouched — nothing here silently escalates trust.
 */
export async function resumeRun(
  runId: string,
  deps: OrchestratorDeps,
  policy: PolicyContext,
  options: ResumeOptions = {},
): Promise<RunOutcome> {
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

  // Standing authorization — the human's explicit second choice. The grant above (a human decision on
  // record) is the authority; this flag only reaches here from the approval surface, never the model.
  let reissuedIntent: SignedMandate<IntentClaims> | undefined;
  if (options.grantStandingAuth) {
    reissuedIntent = await reissueStandingAuth(run, due, approval, deps);
  }

  await consent.setRunStatus(runId, "approved");
  const outcome = await settle(runId, due, deps, policy);
  return outcome.status === "settled" && reissuedIntent ? { ...outcome, reissuedIntent } : outcome;
}

/**
 * Reissue the run's gating IntentMandate as a new standing authorization: a brand-new signed mandate
 * (new jti) that adds this destination to the allowlist, raises the per-transaction cap to at least
 * cover the approved amount, carries any cumulative budget forward (raised to cover it too), and gets
 * a fresh expiry equal to the original's window. Mandates are immutable — this mints a new one, never
 * mutates the old — and it is persisted against the run for the audit trail, but is deliberately *not*
 * made the run's `intent_jti`, so this settled run never back-counts against the new budget.
 */
async function reissueStandingAuth(
  run: Run,
  due: AmountDue,
  approval: { readonly decidedBy: string | null },
  deps: OrchestratorDeps,
): Promise<SignedMandate<IntentClaims> | undefined> {
  const { consent, issuerKey } = deps;

  // The mandate this run was gated by is on record; read its claims (verifying the signature, but
  // tolerating expiry — we are reissuing precisely because it may be stale).
  const stored = await consent.mandatesForRun(run.id);
  const intentRow = stored.find((m) => m.kind === "IntentMandate" && (run.intentJti ? m.jti === run.intentJti : true));
  if (!intentRow) {
    await consent.appendEvent(run.id, "info", "Standing authorization not granted: this run has no gating IntentMandate on record to reissue.");
    return undefined;
  }
  const original = verifyIntentMandate(intentRow.jws, issuerKey.publicKey, 0);

  const allowlist = original.destinationAllowlist.includes(due.destinationId)
    ? [...original.destinationAllowlist]
    : [...original.destinationAllowlist, due.destinationId];
  const spendCapMinor = Math.max(original.spendCapMinor, due.amountMinor);
  const cumulativeCapMinor =
    original.cumulativeCapMinor !== undefined ? Math.max(original.cumulativeCapMinor, due.amountMinor) : undefined;
  const ttlSeconds = Math.max(original.exp - original.iat, 3600);

  const reissued = issueIntentMandate(
    {
      userId: original.userId,
      spendCapMinor,
      ...(cumulativeCapMinor !== undefined ? { cumulativeCapMinor } : {}),
      currency: original.currency,
      destinationAllowlist: allowlist,
      ttlSeconds,
    },
    issuerKey,
  );
  await consent.recordMandate({ jti: reissued.claims.jti, runId: run.id, kind: "IntentMandate", jws: reissued.jws, kid: reissued.kid });
  await consent.appendEvent(
    run.id,
    "mandate_issued",
    `Reissued IntentMandate as a standing authorization at ${approval.decidedBy ?? "a reviewer"}'s request: trust ${due.destinationId} up to ` +
      `${formatMinor(spendCapMinor, original.currency)}` +
      (cumulativeCapMinor !== undefined ? ` (cumulative ${formatMinor(cumulativeCapMinor, original.currency)})` : "") +
      ` going forward. New jti ${reissued.claims.jti}.`,
    { jti: reissued.claims.jti, spendCapMinor, cumulativeCapMinor: cumulativeCapMinor ?? null, allowlist },
  );
  return reissued;
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
