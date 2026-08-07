/**
 * Scoped payment tokens — a narrowly-bound, single-use, revocable reference to a payment method.
 *
 * The production shape of this is Stripe's **Shared Payment Token**: a token bound to a merchant and
 * an amount, time-limited and revocable, so an agent exchanges a mandate for a token, uses it once,
 * and it dies. Where a destination is Stripe-backed you would mint the real thing. StreamCo has no
 * issuer, so — exactly as the plan's fallback allows — we mint our own, carrying the same binding
 * fields and enforcing the same refusals. It is honestly *our* token, not Stripe's, and the surfaces
 * and DESIGN.md say so; what it demonstrates is the *scoping*, which is the point.
 *
 * The binding buys three refusals that plain payment-method reuse cannot, plus single-use:
 *  - **Replay at the wrong destination** — a token minted for A, presented at B, is refused.
 *  - **Amount tampering** — minted for $20, presented for $200, refused on the amount bind.
 *  - **Expiry** — presented past its window, refused.
 *  - **Reuse** — the same token presented twice, refused (a spent-jti registry).
 *
 * All four are enforced here against a genuine EdDSA signature, so a tampered token also fails the
 * signature check independently of the field checks.
 */
import { randomUUID } from "node:crypto";

import { signJws, verifyJws, JwsVerificationError, type JwsHeader } from "./jws.js";
import { asVerifyingKey, type IssuerKey, type VerifyingKey } from "./keys.js";

export interface PaymentTokenClaims {
  readonly tokenType: "PaymentToken";
  readonly jti: string;
  readonly iss: string;
  readonly iat: number;
  readonly exp: number;
  readonly userId: string;
  /** The destination this token may be presented at — nowhere else. */
  readonly destinationId: string;
  /** The exact amount this token authorizes — not a ceiling, an exact match. */
  readonly amountMinor: number;
  readonly currency: string;
  /** The PaymentMandate this token was granted against, if any. */
  readonly paymentMandateJti?: string;
}

export interface ScopedPaymentToken {
  readonly jws: string;
  readonly kid: string;
  readonly alg: "EdDSA";
  /** Deliberately not Stripe's — our own scoped token, labelled as such. */
  readonly kind: "pay-agent-scoped-token";
  readonly claims: PaymentTokenClaims;
}

export interface IssueTokenInput {
  readonly userId: string;
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly ttlSeconds: number;
  readonly paymentMandateJti?: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Mint a scoped token bound to one destination and one exact amount, valid for `ttlSeconds`. */
export function issuePaymentToken(input: IssueTokenInput, key: IssuerKey): ScopedPaymentToken {
  const iat = nowSeconds();
  const claims: PaymentTokenClaims = {
    tokenType: "PaymentToken",
    jti: `spt_${randomUUID()}`,
    iss: key.kid,
    iat,
    exp: iat + input.ttlSeconds,
    userId: input.userId,
    destinationId: input.destinationId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    ...(input.paymentMandateJti === undefined ? {} : { paymentMandateJti: input.paymentMandateJti }),
  };
  const header: JwsHeader = { alg: "EdDSA", typ: "pay-agent-token+jws", kid: key.kid };
  const jws = signJws(claims, key.privateKey, header);
  return { jws, kid: key.kid, alg: "EdDSA", kind: "pay-agent-scoped-token", claims };
}

/** Why a token was refused, for the demo output and the audit trail. */
export type TokenRefusal =
  | "signature"
  | "wrong_destination"
  | "amount_mismatch"
  | "currency_mismatch"
  | "expired"
  | "reused";

export class TokenRefused extends Error {
  readonly refusal: TokenRefusal;
  constructor(refusal: TokenRefusal, message: string) {
    super(message);
    this.name = "TokenRefused";
    this.refusal = refusal;
  }
}

/**
 * A registry of spent token ids, so a token cannot be presented twice. In-memory here — a real
 * deployment persists it — but the guarantee is the same: `redeem` records the jti and refuses a
 * repeat. Kept as an explicit object so the demo and tests can inspect it.
 */
export class SpentTokens {
  private readonly spent = new Set<string>();
  has(jti: string): boolean {
    return this.spent.has(jti);
  }
  markSpent(jti: string): void {
    this.spent.add(jti);
  }
}

export interface PresentedContext {
  readonly destinationId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly atSeconds?: number;
}

/**
 * Verify a token against the context it is being presented in, WITHOUT spending it. Throws
 * `TokenRefused` with the specific reason on any bind violation. This is the check every one of the
 * bind demos exercises; `redeemPaymentToken` layers single-use on top.
 */
export function verifyPaymentToken(
  token: string,
  key: VerifyingKey,
  presented: PresentedContext,
): PaymentTokenClaims {
  let claims: PaymentTokenClaims;
  try {
    ({ claims } = verifyJws<PaymentTokenClaims>(token, asVerifyingKey(key)));
  } catch (err) {
    if (err instanceof JwsVerificationError) throw new TokenRefused("signature", err.message);
    throw err;
  }
  if (claims.tokenType !== "PaymentToken") {
    throw new TokenRefused("signature", `not a PaymentToken (${(claims as { tokenType?: string }).tokenType})`);
  }

  const at = presented.atSeconds ?? nowSeconds();
  if (claims.exp <= at) {
    throw new TokenRefused("expired", `token expired at ${claims.exp} (presented at ${at})`);
  }
  if (claims.destinationId !== presented.destinationId) {
    throw new TokenRefused(
      "wrong_destination",
      `token is bound to "${claims.destinationId}", presented at "${presented.destinationId}"`,
    );
  }
  if (claims.currency !== presented.currency) {
    throw new TokenRefused("currency_mismatch", `token is in ${claims.currency}, presented as ${presented.currency}`);
  }
  if (claims.amountMinor !== presented.amountMinor) {
    throw new TokenRefused(
      "amount_mismatch",
      `token authorizes ${claims.amountMinor} ${claims.currency}, presented for ${presented.amountMinor}`,
    );
  }
  return claims;
}

/**
 * Verify and spend a token: everything `verifyPaymentToken` checks, plus single-use against a
 * `SpentTokens` registry. On success the token's jti is recorded so a second presentation is refused.
 */
export function redeemPaymentToken(
  token: string,
  key: VerifyingKey,
  presented: PresentedContext,
  spent: SpentTokens,
): PaymentTokenClaims {
  // Peek at the jti first (via a full verify) so a reused-but-otherwise-valid token is refused as
  // "reused" rather than passing. The signature is checked inside verifyPaymentToken.
  const claims = verifyPaymentToken(token, key, presented);
  if (spent.has(claims.jti)) {
    throw new TokenRefused("reused", `token ${claims.jti} was already spent`);
  }
  spent.markSpent(claims.jti);
  return claims;
}
