/**
 * The consent mandates, signed.
 *
 * Three credentials, following AP2's names and field semantics (see the UCP↔AP2 layering guidance):
 *
 *  - **IntentMandate** — the user's standing authorization to the agent: a spend cap, an allowlist of
 *    destinations, an expiry. The agent loads this before it spends; the policy gate reads it.
 *  - **CheckoutMandate** — attests to the *exact checkout state* via a hash of it, so an amount that
 *    moves after the quote no longer matches what was agreed.
 *  - **PaymentMandate** — attests to the *instrument mix*, bound to the CheckoutMandate it settles.
 *
 * These are signed as plain EdDSA JWS rather than SD-JWT-VC — the `format: "jws"` field says so at
 * the type level and `docs/DESIGN.md` records it — but the names and the semantics are the spec's.
 * The `jws` string is the source of truth; the decoded `claims` beside it exist only so a surface can
 * render a mandate without re-verifying, and must never be trusted without `verify*` confirming them.
 */
import { randomUUID } from "node:crypto";

import { contentHash, type Canonicalizable } from "./canonical.js";
import { signJws, verifyJws, JwsVerificationError, type JwsHeader } from "./jws.js";
import { asVerifyingKey, type IssuerKey, type VerifyingKey } from "./keys.js";

export type MandateKind = "IntentMandate" | "CheckoutMandate" | "PaymentMandate";

interface BaseClaims {
  readonly mandateType: MandateKind;
  /** Unique id, so a mandate can be referenced and de-duplicated in the audit trail. */
  readonly jti: string;
  /** Issuer key id (matches the JWS header `kid`). */
  readonly iss: string;
  /** Issued-at, seconds since the epoch (JWT convention). */
  readonly iat: number;
}

export interface IntentClaims extends BaseClaims {
  readonly mandateType: "IntentMandate";
  readonly userId: string;
  readonly spendCapMinor: number;
  readonly currency: string;
  /** Destination ids the user pre-authorized; anything else needs approval even under the cap. */
  readonly destinationAllowlist: readonly string[];
  /** Expiry, seconds since the epoch. A stale intent is refused. */
  readonly exp: number;
}

export interface CheckoutClaims extends BaseClaims {
  readonly mandateType: "CheckoutMandate";
  readonly reference: string;
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  /** Hash of the canonical checkout state this mandate commits to. */
  readonly checkoutHash: string;
}

/** One leg of the authorized mix. `card` carries an amount; `gift_card` is open-amount (no amount). */
export interface MandateInstrument {
  readonly type: "gift_card" | "card";
  readonly amountMinor?: number;
}

export interface PaymentClaims extends BaseClaims {
  readonly mandateType: "PaymentMandate";
  readonly reference: string;
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  /** The CheckoutMandate this payment settles, bound by id. */
  readonly checkoutMandateJti: string;
  readonly instruments: readonly MandateInstrument[];
}

/** A signed mandate: the compact JWS is authoritative; `claims` is a decoded convenience copy. */
export interface SignedMandate<Claims extends BaseClaims> {
  readonly kind: Claims["mandateType"];
  readonly jws: string;
  readonly kid: string;
  readonly alg: "EdDSA";
  /** Deliberately not "sd-jwt-vc": this is single-signature JWS, and the surfaces say so. */
  readonly format: "jws";
  readonly claims: Claims;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function headerFor(kid: string, typ: string): JwsHeader {
  return { alg: "EdDSA", typ, kid };
}

function seal<Claims extends BaseClaims>(claims: Claims, key: IssuerKey, typ: string): SignedMandate<Claims> {
  const jws = signJws(claims, key.privateKey, headerFor(key.kid, typ));
  return { kind: claims.mandateType, jws, kid: key.kid, alg: "EdDSA", format: "jws", claims };
}

/** Hash a checkout state into the value a CheckoutMandate commits to. */
export function checkoutStateHash(state: Canonicalizable): string {
  return contentHash(state);
}

export interface IntentInput {
  readonly userId: string;
  readonly spendCapMinor: number;
  readonly currency: string;
  readonly destinationAllowlist: readonly string[];
  /** Seconds the intent is valid for, from now. */
  readonly ttlSeconds: number;
}

export function issueIntentMandate(input: IntentInput, key: IssuerKey): SignedMandate<IntentClaims> {
  const iat = nowSeconds();
  const claims: IntentClaims = {
    mandateType: "IntentMandate",
    jti: randomUUID(),
    iss: key.kid,
    iat,
    userId: input.userId,
    spendCapMinor: input.spendCapMinor,
    currency: input.currency,
    destinationAllowlist: [...input.destinationAllowlist],
    exp: iat + input.ttlSeconds,
  };
  return seal(claims, key, "intent+jws");
}

export interface CheckoutInput {
  readonly reference: string;
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  /** The checkout state to bind to; hashed into the mandate. */
  readonly checkoutState: Canonicalizable;
}

export function issueCheckoutMandate(input: CheckoutInput, key: IssuerKey): SignedMandate<CheckoutClaims> {
  const claims: CheckoutClaims = {
    mandateType: "CheckoutMandate",
    jti: randomUUID(),
    iss: key.kid,
    iat: nowSeconds(),
    reference: input.reference,
    destinationId: input.destinationId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    checkoutHash: checkoutStateHash(input.checkoutState),
  };
  return seal(claims, key, "checkout+jws");
}

export interface PaymentInput {
  readonly reference: string;
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly checkoutMandate: SignedMandate<CheckoutClaims>;
  readonly instruments: readonly MandateInstrument[];
}

export function issuePaymentMandate(input: PaymentInput, key: IssuerKey): SignedMandate<PaymentClaims> {
  const claims: PaymentClaims = {
    mandateType: "PaymentMandate",
    jti: randomUUID(),
    iss: key.kid,
    iat: nowSeconds(),
    reference: input.reference,
    destinationId: input.destinationId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    checkoutMandateJti: input.checkoutMandate.claims.jti,
    instruments: input.instruments.map((i) =>
      i.amountMinor === undefined ? { type: i.type } : { type: i.type, amountMinor: i.amountMinor },
    ),
  };
  return seal(claims, key, "payment+jws");
}

function verifyMandate<Claims extends BaseClaims>(
  jws: string,
  key: VerifyingKey,
  expected: MandateKind,
): Claims {
  const { claims } = verifyJws<Claims>(jws, asVerifyingKey(key));
  if (claims.mandateType !== expected) {
    throw new JwsVerificationError(`expected a ${expected}, got ${claims.mandateType}`);
  }
  return claims;
}

export function verifyIntentMandate(jws: string, key: VerifyingKey, atSeconds = nowSeconds()): IntentClaims {
  const claims = verifyMandate<IntentClaims>(jws, key, "IntentMandate");
  if (claims.exp <= atSeconds) {
    throw new JwsVerificationError(`intent mandate expired at ${claims.exp} (now ${atSeconds})`);
  }
  return claims;
}

export function verifyCheckoutMandate(jws: string, key: VerifyingKey): CheckoutClaims {
  return verifyMandate<CheckoutClaims>(jws, key, "CheckoutMandate");
}

export function verifyPaymentMandate(jws: string, key: VerifyingKey): PaymentClaims {
  return verifyMandate<PaymentClaims>(jws, key, "PaymentMandate");
}

/**
 * Verify a payment against the checkout it claims to settle: the signature must hold, and the bound
 * amount, currency, destination and checkout id must all agree. This is the "amount moved after the
 * quote" defence made mechanical — a PaymentMandate cannot be presented for a different amount than
 * the CheckoutMandate hashed, because it names that mandate and repeats its amount under signature.
 */
export function verifyPaymentAgainstCheckout(
  paymentJws: string,
  checkout: CheckoutClaims,
  key: VerifyingKey,
): PaymentClaims {
  const payment = verifyPaymentMandate(paymentJws, key);
  if (payment.checkoutMandateJti !== checkout.jti) {
    throw new JwsVerificationError("payment mandate does not reference this checkout mandate");
  }
  if (payment.amountMinor !== checkout.amountMinor || payment.currency !== checkout.currency) {
    throw new JwsVerificationError("payment mandate amount/currency does not match the checkout mandate");
  }
  if (payment.destinationId !== checkout.destinationId) {
    throw new JwsVerificationError("payment mandate destination does not match the checkout mandate");
  }
  return payment;
}
