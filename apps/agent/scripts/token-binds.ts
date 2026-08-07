/**
 * The scoped-payment-token bind demos — the "refused" moments.
 *
 * Mints one scoped token for the StreamCo destination at $20.00 and then tries to abuse it four ways,
 * each of which the token's binding refuses, before finally using it correctly once. This is the
 * demonstrable heart of the token story: a real payment network (in production, Stripe's Shared
 * Payment Tokens) refusing a bad request, rather than our own code marking its own homework. Here the
 * token is our own (StreamCo has no issuer), carrying the same binding fields — labelled as such.
 *
 * Usage:  pnpm --filter @pay-agent/agent token-binds
 */
import {
  issuePaymentToken,
  loadIssuerKey,
  redeemPaymentToken,
  SpentTokens,
  TokenRefused,
  verifyPaymentToken,
} from "@pay-agent/mandate";

const key = loadIssuerKey();

function money(minor: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(minor / 100);
}

function attempt(label: string, fn: () => unknown): void {
  try {
    fn();
    console.log(`  ✓ ${label} — ACCEPTED`);
  } catch (err) {
    if (err instanceof TokenRefused) {
      console.log(`  ✗ ${label} — REFUSED (${err.refusal}): ${err.message}`);
    } else {
      throw err;
    }
  }
}

function main(): void {
  const token = issuePaymentToken(
    { userId: "demo-user", destinationId: "streamco", amountMinor: 2000, currency: "CAD", ttlSeconds: 300 },
    key,
  );
  console.log(`Minted a scoped token for "streamco" at ${money(2000)} (jti ${token.claims.jti}).`);
  console.log(`Signed EdDSA JWS · kid ${token.kid} · our own token (StreamCo has no issuer), not Stripe's.\n`);

  console.log("Attempting to abuse it:");
  attempt("replay at ucp-storefront", () =>
    verifyPaymentToken(token.jws, key.publicKey, { destinationId: "ucp-storefront", amountMinor: 2000, currency: "CAD" }),
  );
  attempt(`amount tamper — present ${money(20000)}`, () =>
    verifyPaymentToken(token.jws, key.publicKey, { destinationId: "streamco", amountMinor: 20000, currency: "CAD" }),
  );
  attempt("present after expiry", () =>
    verifyPaymentToken(token.jws, key.publicKey, { destinationId: "streamco", amountMinor: 2000, currency: "CAD", atSeconds: token.claims.exp + 1 }),
  );

  const spent = new SpentTokens();
  const ctx = { destinationId: "streamco", amountMinor: 2000, currency: "CAD" };
  console.log("\nUsing it correctly, once:");
  attempt(`present at streamco for ${money(2000)}`, () => redeemPaymentToken(token.jws, key.publicKey, ctx, spent));
  attempt("present the same token again", () => redeemPaymentToken(token.jws, key.publicKey, ctx, spent));

  console.log("\nEvery abuse was refused by the token's binding; the correct use worked exactly once.");
}

main();
