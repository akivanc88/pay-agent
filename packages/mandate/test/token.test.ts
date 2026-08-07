/** Verifies the scoped-payment-token binds: replay, amount tamper, expiry, reuse — each refused. */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  issuePaymentToken,
  loadIssuerKey,
  redeemPaymentToken,
  SpentTokens,
  TokenRefused,
  verifyPaymentToken,
} from "../src/index.js";

const key = loadIssuerKey({});

/** Run `fn`, expecting a TokenRefused, and return its refusal reason. */
function refusalOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof TokenRefused) return err.refusal;
    throw err;
  }
  throw new Error("expected a TokenRefused, but nothing was thrown");
}

function mint() {
  return issuePaymentToken(
    { userId: "demo-user", destinationId: "streamco", amountMinor: 2000, currency: "CAD", ttlSeconds: 300 },
    key,
  );
}

test("a token verifies at the destination and amount it was minted for", () => {
  const token = mint();
  const claims = verifyPaymentToken(token.jws, key.publicKey, { destinationId: "streamco", amountMinor: 2000, currency: "CAD" });
  assert.equal(claims.amountMinor, 2000);
  assert.equal(token.kind, "pay-agent-scoped-token");
});

test("replay at the wrong destination is refused", () => {
  const token = mint();
  assert.equal(
    refusalOf(() => verifyPaymentToken(token.jws, key.publicKey, { destinationId: "ucp-storefront", amountMinor: 2000, currency: "CAD" })),
    "wrong_destination",
  );
});

test("amount tampering (mint $20, present $200) is refused", () => {
  const token = mint();
  assert.equal(
    refusalOf(() => verifyPaymentToken(token.jws, key.publicKey, { destinationId: "streamco", amountMinor: 20000, currency: "CAD" })),
    "amount_mismatch",
  );
});

test("an expired token is refused", () => {
  const token = mint();
  assert.equal(
    refusalOf(() =>
      verifyPaymentToken(token.jws, key.publicKey, {
        destinationId: "streamco",
        amountMinor: 2000,
        currency: "CAD",
        atSeconds: token.claims.exp + 1,
      }),
    ),
    "expired",
  );
});

test("the same token cannot be spent twice", () => {
  const token = mint();
  const spent = new SpentTokens();
  const ctx = { destinationId: "streamco", amountMinor: 2000, currency: "CAD" };
  redeemPaymentToken(token.jws, key.publicKey, ctx, spent); // first use — ok
  assert.equal(refusalOf(() => redeemPaymentToken(token.jws, key.publicKey, ctx, spent)), "reused");
});

test("a tampered token fails the signature independently of the field checks", () => {
  const token = mint();
  const [h, , sig] = token.jws.split(".") as [string, string, string];
  // Flip the payload to a higher amount; the stale signature no longer verifies.
  const forged = { ...token.claims, amountMinor: 999999 };
  const forgedPayload = Buffer.from(JSON.stringify(forged)).toString("base64url");
  assert.equal(
    refusalOf(() => verifyPaymentToken(`${h}.${forgedPayload}.${sig}`, key.publicKey, { destinationId: "streamco", amountMinor: 999999, currency: "CAD" })),
    "signature",
  );
});
