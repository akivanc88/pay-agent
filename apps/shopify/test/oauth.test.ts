/** HMAC verification is the one security-critical piece of the OAuth handshake — test it directly rather than through a live Shopify redirect. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { isValidShopDomain, verifyHmac, verifyWebhookHmac } from "../src/oauth.js";

const SECRET = "test-secret";

function signedQuery(params: Record<string, string>): URLSearchParams {
  const message = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const hmac = createHmac("sha256", SECRET).update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac });
}

test("a genuinely Shopify-signed callback verifies", () => {
  const query = signedQuery({ shop: "acme.myshopify.com", code: "abc123", state: "nonce1" });
  assert.equal(verifyHmac(query, SECRET), true);
});

test("a tampered parameter fails verification", () => {
  const query = signedQuery({ shop: "acme.myshopify.com", code: "abc123", state: "nonce1" });
  query.set("shop", "attacker.myshopify.com");
  assert.equal(verifyHmac(query, SECRET), false);
});

test("a missing hmac fails closed", () => {
  const query = new URLSearchParams({ shop: "acme.myshopify.com", code: "abc123" });
  assert.equal(verifyHmac(query, SECRET), false);
});

test("a genuinely Shopify-signed webhook body verifies", () => {
  const rawBody = Buffer.from(JSON.stringify({ id: 1, domain: "acme.myshopify.com" }));
  const header = createHmac("sha256", SECRET).update(rawBody).digest("base64");
  assert.equal(verifyWebhookHmac(rawBody, header, SECRET), true);
});

test("a tampered webhook body fails verification", () => {
  const rawBody = Buffer.from(JSON.stringify({ id: 1, domain: "acme.myshopify.com" }));
  const header = createHmac("sha256", SECRET).update(rawBody).digest("base64");
  const tamperedBody = Buffer.from(JSON.stringify({ id: 1, domain: "attacker.myshopify.com" }));
  assert.equal(verifyWebhookHmac(tamperedBody, header, SECRET), false);
});

test("a missing webhook hmac header fails closed", () => {
  const rawBody = Buffer.from(JSON.stringify({ id: 1, domain: "acme.myshopify.com" }));
  assert.equal(verifyWebhookHmac(rawBody, undefined, SECRET), false);
});

test("shop domain validation rejects anything not a myshopify.com store", () => {
  assert.equal(isValidShopDomain("acme.myshopify.com"), true);
  assert.equal(isValidShopDomain("acme.evil.com"), false);
  assert.equal(isValidShopDomain("https://acme.myshopify.com"), false);
});
