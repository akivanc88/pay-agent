/**
 * Shopify's classic OAuth handshake: authorize redirect, callback with HMAC verification, and the
 * code-for-token exchange. Raw `fetch` + Node's built-in `crypto`, no `@shopify/shopify-api` SDK —
 * same "zero-dep, understand every request" discipline as `brain/openai.ts` / `brain/anthropic.ts`.
 *
 * Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ShopifyOAuthConfig {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly scopes: string;
  readonly appUrl: string; // e.g. https://pay-agent-shopify.example.com
}

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function isValidShopDomain(shop: string): boolean {
  return SHOP_DOMAIN_RE.test(shop);
}

export function authorizeUrl(shop: string, state: string, config: ShopifyOAuthConfig): string {
  const redirectUri = `${config.appUrl}/auth/callback`;
  const params = new URLSearchParams({
    client_id: config.apiKey,
    scope: config.scopes,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verify the query-string HMAC Shopify signs every redirect with — proves the callback actually
 * came from Shopify and wasn't forged. `signature` and `hmac` params are excluded, per Shopify's
 * own algorithm.
 */
export function verifyHmac(query: URLSearchParams, apiSecret: string): boolean {
  const hmac = query.get("hmac");
  if (!hmac) return false;
  const message = [...query.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const computed = createHmac("sha256", apiSecret).update(message).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function exchangeCodeForToken(
  shop: string,
  code: string,
  config: ShopifyOAuthConfig,
): Promise<{ accessToken: string; scope: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.apiKey, client_secret: config.apiSecret, code }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string; scope: string };
  return { accessToken: body.access_token, scope: body.scope };
}
