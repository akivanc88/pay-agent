/**
 * The free pay-agent Shopify app — a thin, embedded client onto agent-payment trust, not a
 * checkout replacement. Shopify already speaks real UCP for agentic checkout (see README's
 * "Grounding"); this app's job is narrower and complementary: let a merchant *see*, inside their
 * own admin, that agent-initiated payments on their store are capped and audited — the same
 * signed-mandate story the OSS core tells, surfaced merchant-side. It is deliberately free: the
 * distribution/trust vehicle for pay-agent Cloud (see `apps/agent`'s sibling repo,
 * `pay-agent-cloud`), not the revenue product itself.
 *
 * Handshake: install (`/auth`) -> Shopify's OAuth authorize redirect -> `/auth/callback` (HMAC
 * verified, code exchanged for an access token) -> embedded admin page (`/`) rendered inside the
 * Shopify admin iframe via App Bridge.
 *
 * Needs a real Shopify Partner app registration to actually install anywhere — see
 * `shopify.app.toml` and `.env.example`. Until those are filled in with real values this runs and
 * typechecks, but Shopify itself will refuse the OAuth redirect (unknown client_id).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

import { authorizeUrl, exchangeCodeForToken, isValidShopDomain, verifyHmac, type ShopifyOAuthConfig } from "./oauth.js";
import { openShopStore } from "./shop-store.js";

const PORT = Number(process.env.PORT ?? 3020);
const config: ShopifyOAuthConfig = {
  apiKey: process.env.SHOPIFY_API_KEY ?? "REPLACE_WITH_REAL_CLIENT_ID",
  apiSecret: process.env.SHOPIFY_API_SECRET ?? "REPLACE_WITH_REAL_CLIENT_SECRET",
  scopes: process.env.SHOPIFY_SCOPES ?? "read_orders",
  appUrl: process.env.SHOPIFY_APP_URL ?? `http://localhost:${PORT}`,
};
const CLOUD_URL = process.env.PAY_AGENT_CLOUD_URL; // e.g. https://api.pay-agent.dev — the hosted mandate API

const shops = openShopStore(process.env.SHOP_DB_PATH ?? ".data/shops.db");

// One-time nonces for the OAuth `state` param, so a callback can't be replayed against a
// different install attempt. In-memory is fine for a single-instance demo deployment.
const pendingStates = new Set<string>();

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function handleInstall(url: URL, res: ServerResponse): void {
  const shop = url.searchParams.get("shop");
  if (!shop || !isValidShopDomain(shop)) return json(res, 400, { error: "missing or invalid ?shop=<store>.myshopify.com" });
  const state = randomBytes(16).toString("hex");
  pendingStates.add(state);
  res.writeHead(302, { Location: authorizeUrl(shop, state, config) });
  res.end();
}

async function handleCallback(url: URL, res: ServerResponse): Promise<void> {
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!shop || !isValidShopDomain(shop) || !code || !state) return json(res, 400, { error: "malformed callback" });
  if (!pendingStates.delete(state)) return json(res, 403, { error: "unknown or reused state" });
  if (!verifyHmac(url.searchParams, config.apiSecret)) return json(res, 403, { error: "invalid hmac — request did not come from Shopify" });

  const { accessToken } = await exchangeCodeForToken(shop, code, config);
  shops.upsertShop(shop, accessToken);
  res.writeHead(302, { Location: `/?shop=${encodeURIComponent(shop)}` });
  res.end();
}

/** Best-effort: this shop's pay-agent Cloud usage, if it's been linked to a tenant. Not wired up automatically yet — see README. */
async function cloudUsage(cloudApiKey: string): Promise<{ mandatesIssued: number; estimatedFeeCents: number } | null> {
  if (!CLOUD_URL) return null;
  try {
    const res = await fetch(`${CLOUD_URL}/v1/usage`, { headers: { Authorization: `Bearer ${cloudApiKey}` } });
    if (!res.ok) return null;
    return (await res.json()) as { mandatesIssued: number; estimatedFeeCents: number };
  } catch {
    return null;
  }
}

async function handleAdminPage(url: URL, res: ServerResponse): Promise<void> {
  const shopDomain = url.searchParams.get("shop");
  const shop = shopDomain ? shops.getShop(shopDomain) : null;

  if (!shop) {
    return html(
      res,
      200,
      `<!doctype html><title>pay-agent for Shopify</title>
      <body style="font-family:system-ui;max-width:32rem;margin:4rem auto;">
        <h1>pay-agent for Shopify</h1>
        <p>Not installed for this shop yet. Install with:</p>
        <code>/auth?shop=&lt;your-store&gt;.myshopify.com</code>
      </body>`,
    );
  }

  const usage = shop.cloudApiKey ? await cloudUsage(shop.cloudApiKey) : null;

  html(
    res,
    200,
    `<!doctype html><title>pay-agent for Shopify</title>
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
    <body style="font-family:system-ui;max-width:36rem;margin:3rem auto;padding:0 1.5rem;">
      <h1>Agent payment activity — ${shop.domain}</h1>
      <p>Every payment an AI agent makes through pay-agent on this store is capped by a signed
      mandate and recorded in an audit trail before any money moves — this page is that trail,
      not a settlement path of its own.</p>
      ${
        usage
          ? `<p><strong>${usage.mandatesIssued}</strong> mandate(s) issued this period · est. fee
             <strong>${(usage.estimatedFeeCents / 100).toFixed(2)}</strong> (pay-agent Cloud)</p>`
          : `<p style="color:#8a8377;">Not yet linked to a pay-agent Cloud tenant — usage will show
             here once this shop is connected. See this app's README.</p>`
      }
    </body>`,
  );
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname === "/health") return json(res, 200, { ok: true, service: "pay-agent-shopify" });
    if (url.pathname === "/auth") return handleInstall(url, res);
    if (url.pathname === "/auth/callback") return await handleCallback(url, res);
    if (url.pathname === "/") return await handleAdminPage(url, res);
    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error("unhandled request error:", err);
    if (!res.headersSent) json(res, 500, { error: "internal error" });
  }
});

server.listen(PORT, () => {
  console.log(`pay-agent-shopify listening on http://localhost:${PORT}`);
});
