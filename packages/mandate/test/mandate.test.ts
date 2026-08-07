/** Verifies mandate signing, the checkout↔payment binding, and that any one-byte tamper is rejected. */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalize,
  checkoutStateHash,
  issuerKeyFromSeed,
  issueCheckoutMandate,
  issueIntentMandate,
  issuePaymentMandate,
  loadIssuerKey,
  JwsVerificationError,
  publicKeyFromJwk,
  verifyCheckoutMandate,
  verifyIntentMandate,
  verifyPaymentAgainstCheckout,
  verifyPaymentMandate,
} from "../src/index.js";

const key = loadIssuerKey({});
const otherKey = issuerKeyFromSeed(Buffer.alloc(32, 7));

const checkoutState = {
  reference: "cs_123",
  destinationId: "streamco",
  amountMinor: 4599,
  currency: "CAD",
  lines: [{ id: "sub", amountMinor: 4599 }],
};

function freshCheckout() {
  return issueCheckoutMandate(
    {
      reference: "cs_123",
      destinationId: "streamco",
      amountMinor: 4599,
      currency: "CAD",
      checkoutState,
    },
    key,
  );
}

test("canonicalize is stable regardless of key order", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  assert.equal(checkoutStateHash({ a: 1, b: 2 }), checkoutStateHash({ b: 2, a: 1 }));
});

test("a signed checkout mandate verifies and carries the right claims", () => {
  const mandate = freshCheckout();
  assert.equal(mandate.format, "jws");
  assert.equal(mandate.alg, "EdDSA");
  const claims = verifyCheckoutMandate(mandate.jws, key.publicKey);
  assert.equal(claims.amountMinor, 4599);
  assert.equal(claims.destinationId, "streamco");
  assert.equal(claims.checkoutHash, checkoutStateHash(checkoutState));
});

test("a mandate verifies against the issuer's published JWK too", () => {
  const mandate = freshCheckout();
  const claims = verifyCheckoutMandate(mandate.jws, key.publicJwk);
  assert.equal(claims.reference, "cs_123");
  // And the reconstructed KeyObject is equivalent.
  verifyCheckoutMandate(mandate.jws, publicKeyFromJwk(key.publicJwk));
});

test("the wrong key rejects a valid signature", () => {
  const mandate = freshCheckout();
  assert.throws(() => verifyCheckoutMandate(mandate.jws, otherKey.publicKey), JwsVerificationError);
});

test("tampering any one segment is rejected", () => {
  const mandate = freshCheckout();
  const [h, p, s] = mandate.jws.split(".") as [string, string, string];

  // Flip a byte of the payload: re-encode a different amount, keep the old signature.
  const forgedClaims = { ...verifyCheckoutMandate(mandate.jws, key.publicKey), amountMinor: 1 };
  const forgedPayload = Buffer.from(JSON.stringify(forgedClaims)).toString("base64url");
  assert.throws(() => verifyCheckoutMandate(`${h}.${forgedPayload}.${s}`, key.publicKey), JwsVerificationError);

  // Flip a byte of the signature.
  const sigBuf = Buffer.from(s, "base64url");
  sigBuf[0] = sigBuf[0]! ^ 0xff;
  assert.throws(
    () => verifyCheckoutMandate(`${h}.${p}.${sigBuf.toString("base64url")}`, key.publicKey),
    JwsVerificationError,
  );

  // Truncated token.
  assert.throws(() => verifyCheckoutMandate(`${h}.${p}`, key.publicKey), JwsVerificationError);
});

test("a payment mandate binds to its checkout mandate", () => {
  const checkout = freshCheckout();
  const checkoutClaims = verifyCheckoutMandate(checkout.jws, key.publicKey);
  const payment = issuePaymentMandate(
    {
      reference: "cs_123",
      destinationId: "streamco",
      amountMinor: 4599,
      currency: "CAD",
      checkoutMandate: checkout,
      instruments: [{ type: "gift_card" }, { type: "card", amountMinor: 4599 }],
    },
    key,
  );
  const verified = verifyPaymentAgainstCheckout(payment.jws, checkoutClaims, key.publicKey);
  assert.equal(verified.checkoutMandateJti, checkoutClaims.jti);
  assert.equal(verified.instruments.length, 2);
});

test("a payment mandate for a different amount fails the binding", () => {
  const checkout = freshCheckout();
  const checkoutClaims = verifyCheckoutMandate(checkout.jws, key.publicKey);
  // Amount moved after the quote: mint a payment for a higher amount against the same checkout.
  const tampered = issuePaymentMandate(
    {
      reference: "cs_123",
      destinationId: "streamco",
      amountMinor: 9999,
      currency: "CAD",
      checkoutMandate: checkout,
      instruments: [{ type: "card", amountMinor: 9999 }],
    },
    key,
  );
  assert.throws(() => verifyPaymentAgainstCheckout(tampered.jws, checkoutClaims, key.publicKey), JwsVerificationError);
});

test("intent mandates expire", () => {
  const intent = issueIntentMandate(
    { userId: "demo-user", spendCapMinor: 10000, currency: "CAD", destinationAllowlist: ["store"], ttlSeconds: 60 },
    key,
  );
  const claims = verifyIntentMandate(intent.jws, key.publicKey);
  assert.equal(claims.spendCapMinor, 10000);
  assert.deepEqual([...claims.destinationAllowlist], ["store"]);
  // Verify at a time past expiry.
  assert.throws(() => verifyIntentMandate(intent.jws, key.publicKey, claims.exp + 1), JwsVerificationError);
});

test("verifyPaymentMandate rejects a checkout mandate presented as a payment", () => {
  const checkout = freshCheckout();
  assert.throws(() => verifyPaymentMandate(checkout.jws, key.publicKey), JwsVerificationError);
});
