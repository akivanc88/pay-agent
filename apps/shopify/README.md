# @pay-agent/shopify

The free Shopify app — a thin, embedded client that lets a merchant see, inside their own Shopify
admin, that agent-initiated payments on their store are capped by signed mandates and audited. It
is deliberately not a checkout replacement: Shopify's own storefronts already speak real UCP (see
the root README's "Grounding"), so this app's job is narrower — merchant-side trust and visibility,
and a distribution/upsell path into [pay-agent Cloud](https://github.com/akivanc88/pay-agent-cloud)
(the paid hosted mandate API), not a revenue product on its own.

## Status: code-complete, not registered

This app **cannot be installed anywhere yet.** Shopify apps require a real Partner-account app
registration (client id + secret), which is tied to a real business identity — that step can only
be done by whoever owns (or will own) the Shopify Partner account; nothing in this repo can create
it. Everything else — the OAuth handshake, HMAC verification, the embedded admin page — is real,
tested code, ready to run the moment real credentials are supplied.

To go from this scaffold to an installable app:

1. Create a Partner account and an app at [partners.shopify.com](https://partners.shopify.com).
2. Fill in `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` / `SHOPIFY_APP_URL` in `.env` (see `.env.example`).
3. Replace the placeholders in `shopify.app.toml` (or run `shopify app config link` from the
   Partner-linked Shopify CLI, which rewrites it for you).
4. Deploy this app somewhere with a public HTTPS URL (`SHOPIFY_APP_URL` must match), then install
   via `https://<your-app-url>/auth?shop=<store>.myshopify.com`.

## What it does

- `GET /auth?shop=<store>.myshopify.com` — starts Shopify's OAuth authorize redirect.
- `GET /auth/callback` — verifies Shopify's HMAC signature (fails closed on anything tampered or
  unsigned — see `test/oauth.test.ts`), exchanges the code for an access token, and records the
  shop.
- `GET /` — the embedded admin page (loads Shopify App Bridge), showing this shop's pay-agent Cloud
  mandate usage if the shop has been linked to a Cloud tenant. Linking isn't automated yet — see
  "Not yet built" below.

## Running it

```bash
pnpm --filter @pay-agent/shopify dev   # http://localhost:3020
pnpm --filter @pay-agent/shopify test  # OAuth HMAC verification tests, no Shopify account needed
```

## pay-agent Cloud linking

If `PAY_AGENT_CLOUD_URL` and `CLOUD_ADMIN_TOKEN` are set, a newly-installed shop is automatically
provisioned a pay-agent Cloud tenant (`src/cloud-link.ts`, called from the OAuth callback) — the
returned tenant API key is stored as `shop.cloudApiKey`, and the embedded admin page then shows that
shop's real mandate usage. Best-effort: a provisioning failure logs and still completes the
install, it just leaves the shop unlinked (visiting `/auth?shop=...` again retries it, since a shop
without a `cloudApiKey` gets provisioned on any subsequent OAuth callback). Without those two env
vars set, the app runs exactly as before — install works, the admin page just shows "not linked".

## Not yet built (tracked, not hidden)

- Shopify App Store listing assets (icon, banner, screenshots) — see `docs/BRAND.md` in the root
  repo for the visual language to build them from.
- Webhook handling (e.g. `app/uninstalled` to clean up the shop record) — the manifest declares the
  API version but no webhook subscriptions yet.
