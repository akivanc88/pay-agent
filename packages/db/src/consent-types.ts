/**
 * Consent-layer domain types: runs, the append-only audit trail, approvals, and stored mandates.
 *
 * This is the persistence behind M3's human-in-the-loop story. A *run* is one attempt to pay a
 * destination; every meaningful thing that happens to it is appended to an immutable trail of
 * *events*; when policy trips, an *approval* is raised and waits for a person; and the signed
 * *mandates* the agent issued are kept so a surface can show exactly what was authorized. The trail
 * is the interesting part to put on screen, so — like the funding ledger — it is append-only and
 * enforced by the database, not by convention.
 */

export type RunStatus =
  /** Amount discovered; not yet cleared by policy. */
  | "open"
  /** Policy tripped; a human must decide before any money moves. */
  | "pending_approval"
  /** A human granted approval; the run may settle. */
  | "approved"
  /** A human denied it; the run is abandoned, nothing drawn. */
  | "denied"
  /** Paid and independently confirmed. */
  | "settled"
  /** Payment failed; any gift draw was reversed. */
  | "failed";

/** The kinds of event the audit trail records, in the order a run tends to produce them. */
export type RunEventKind =
  | "discovered"
  | "policy_passed"
  | "policy_blocked"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "mandate_issued"
  | "mandate_verified"
  | "planned"
  | "gift_drawn"
  | "gift_reversed"
  | "card_charged"
  | "paid"
  | "confirmed"
  | "failed"
  | "info";

/** Why an approval was required. A run can trip more than one at once. */
export type ApprovalReason =
  | "over_cap"
  | "destination_not_allowlisted"
  | "uncovered"
  | "currency_mismatch";

export type ApprovalStatus = "pending" | "granted" | "denied";

export type MandateKind = "IntentMandate" | "CheckoutMandate" | "PaymentMandate";

export interface Run {
  readonly id: string;
  readonly userId: string;
  /** The cart id / payment URL / biller account the agent was handed. */
  readonly reference: string;
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly status: RunStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RunEvent {
  /** Insertion order, and the only meaningful ordering — matching the ledger's `seq` discipline. */
  readonly seq: number;
  readonly id: string;
  readonly runId: string;
  readonly kind: RunEventKind;
  /** A human line for the timeline. */
  readonly summary: string;
  /** Optional structured detail, JSON-encoded. */
  readonly data: string | null;
  readonly createdAt: string;
}

export interface Approval {
  readonly runId: string;
  readonly status: ApprovalStatus;
  readonly reasons: readonly ApprovalReason[];
  readonly detail: string;
  /** The spend cap in force when the approval was raised, if a cap applied. */
  readonly capMinor: number | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
}

export interface StoredMandate {
  readonly jti: string;
  readonly runId: string;
  readonly kind: MandateKind;
  /** The compact JWS — the source of truth a verifier checks. */
  readonly jws: string;
  readonly kid: string;
  readonly createdAt: string;
}
