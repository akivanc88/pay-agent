# Deploying the test-mode demo

Two Railway services, one project (`pay-agent-store`), both test-mode Stripe only. No live key
is ever set in either — `assertSafeStripeConfig()` refuses to boot if one is, and that guard is
unit-tested, not just trusted (see `docs/PLAN.md` verification item 9).

| Service | What it runs | Why |
|---|---|---|
| `store` | `apps/store` alone | The UCP merchant — catalogue, checkout, funding ledger, the new testing-only card-issuance endpoint. |
| `web` | `apps/web` **and** `apps/agent`'s resume service, as two processes in one container | They share one local SQLite consent DB (`apps/web/.data/consent.db`) by file path — that assumption only holds if they're on the same disk, so they're deployed together rather than split into a third service. See "Why web+agent share a container" below. |

Both were originally scoped for a free host (Render); the actual deploy used Railway on an
existing paid account instead — see the PLAN.md M6 note for that decision and why it doesn't
change the zero-marginal-cost reasoning.

## Why web+agent share a container

`apps/web` and `apps/agent` are two separate processes even in local dev — but on one laptop
they trivially agree on where `apps/web/.data/consent.db` lives, because it's the same disk.
Split them into two separate Railway services (two separate volumes) and that assumption
breaks silently: a run the agent creates would never show up in the web dashboard's Activity
page, because the two processes would each be writing to their own, unrelated file.

Rather than migrate the consent store onto a networked database (a real, stretch-goal-sized
piece of work — see PLAN.md's Supabase note), `web`'s Railway service runs both processes from
one `startCommand`, sharing one container and one volume, exactly mirroring the local-dev
assumption instead of quietly breaking it:

```
bash -c "pnpm --filter @pay-agent/agent serve & pnpm --filter @pay-agent/web start & wait -n"
```

`wait -n` (bash, not POSIX `sh` — Railway's default shell doesn't support it) exits as soon as
*either* process dies, so a crash in one restarts the whole container rather than leaving a
half-dead service running silently.

## Config-as-code: two files, one slot

Railway's `railway.json` config-as-code is **single-service per file** — there is no
multi-service key. With two services in one project, only one file can be the checked-in
`railway.json` at a time. The two real configs live at:

- `deploy/railway.store.json`
- `deploy/railway.web-agent.json`

**To (re)deploy either service:** copy the matching file over the root `railway.json`, then
deploy that service specifically:

```bash
cp deploy/railway.store.json railway.json
railway up -s store --ci

cp deploy/railway.web-agent.json railway.json
railway up -s web --ci
```

Nothing is committed at the repo root — a `railway.json` sitting there at rest would be
ambiguous about which service it belongs to. It only exists transiently, copied into place
right before a `railway up`.

A cleaner one-time alternative: in the Railway dashboard, each service has a Config-as-code
**Path** setting under Settings → Build. Pointing `store`'s at `deploy/railway.store.json` and
`web`'s at `deploy/railway.web-agent.json` removes the copy-before-deploy step entirely. Not
done here because the CLI's config-editing commands (`environment edit --service-config`)
didn't reliably apply `build.*`/`deploy.*`/`source.*` fields in this session (silent no-ops,
and one outright crash on `volume add` by service name rather than ID) — worth trying again
from the dashboard directly rather than fighting the CLI further.

## Environment variables

| Var | Service(s) | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | store, web | Stripe **test** key. Never `sk_live_*` — `assertSafeStripeConfig` refuses to boot if it is. |
| `STRIPE_PUBLISHABLE_KEY` | store | Stripe test publishable key. |
| `GIFT_CARD_CODE_PEPPER` | store | Required once `NODE_ENV=production` (Railway sets this) — the store refuses to hash gift-card codes with the dev fallback otherwise. Generate with `openssl rand -hex 32`; not committed anywhere. |
| `STORE_URL` | web | `http://store.railway.internal:3000` — Railway's private network DNS, so the proxy and the agent's HTTP calls to the store never leave the project's internal network. |
| `AGENT_URL` | web | `http://localhost:3002` — the agent process lives in the same container, so this is a loopback call, not cross-service. |
| `PORT` | store, web | `3000` / `3001` respectively. Both apps' server binaries default to a hardcoded port; Railway's edge proxy needs an explicit signal to route to it (see "Two real bugs" below). |

`STRIPE_LIVE_SECRET_KEY` is **never** set on either service. That absence, not a check, is what
keeps the live-decline guard inert on the public deploy.

## Volumes

Both services have a Railway volume for real persistence (not reset-on-sleep, unlike a free-tier
host would be):

- `store` → `/app/apps/store/databases` (products, transactions, funding ledger)
- `web` → `/app/apps/web/.data` (the shared consent DB — see above)

Railway creates the mount-point directory itself when a volume is attached, so no app-level
`mkdir` was needed for either.

## Seeding

Neither service seeds itself on boot. After a first deploy (or whenever you want a clean demo
state instead of accumulated test traffic):

```bash
railway ssh -s store -- pnpm --filter @pay-agent/store seed
railway ssh -s web   -- pnpm --filter @pay-agent/agent seed-consent
```

Both are idempotent / safe to rerun (`seed` upserts by product id; `seed-consent` wipes and
rewrites its own file fresh each time — it's meant to be rerun for a clean demo state, not run
once).

## Three real bugs this surfaced (not deploy misconfiguration — actual code fixes)

1. **Build order.** The initial `buildCommand` built only the target package
   (`pnpm --filter @pay-agent/store build`), not its workspace dependencies first
   (`@pay-agent/db`, `@pay-agent/protocol`) — `tsc` failed with `Cannot find module '@pay-agent/db'`
   because their `dist/` didn't exist yet. Fixed by using pnpm's `...` filter suffix
   (`--filter @pay-agent/store... build`), which builds the dependency chain in topological order.
2. **Loopback binding.** `@hono/node-server`'s `serve()` wasn't given an explicit `hostname` in
   `apps/store/src/index.ts` — inside a container that resolved to loopback-only, so the app logged
   "running" while every external request 502'd. Fixed with `hostname: "0.0.0.0"`, and made the
   port configurable via `$PORT` (both apps' server entrypoints hardcoded a port before this).
3. **Cross-container local-disk assumption.** `apps/agent`'s demo wallet used to mint a gift card
   by shelling out to `pnpm issue-card` directly against `apps/store`'s local filesystem — silently
   fine in local dev (one machine, one disk), silently *wrong* once agent and store became separate
   containers (it wrote to the caller's own disk, never reaching the store's real ledger). Fixed
   properly: added a testing-only, `Simulation-Secret`-guarded `POST /testing/issue-card` endpoint
   to the store (matching the existing `shipOrder` testing-endpoint pattern), and `issueDemoCard`
   now calls it over HTTP — restoring the "agent and merchant separated by HTTP" boundary
   (`AGENTS.md` rule 6) that this one code path had quietly slipped.

## Deployed URLs

- Store: https://store-production-331d.up.railway.app
- Web (+ Agent Console): https://web-production-5a199f.up.railway.app
