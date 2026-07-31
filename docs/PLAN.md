# Plan: `pay-agent` — Gift-Card-Funded Payment Agent (Capstone)

## Context

`pay-agent` is an empty repo — one README line: *"POC Agent that can use gift cards to make payments on behalf of user."*

The capstone demonstrates: **a user loads gift cards into a dashboard; an agent then goes to some place that wants money, works out what's owed, decides how to pay from that funding, gets human approval when it should, pays, and handles failure sensibly.**

The critical word is **some place**. Stripe is one destination, not the point. A subscription biller (the Netflix / Disney+ archetype), a spec-native agentic storefront, and a machine-native API paywall are all destinations too. The architecture's main axis is therefore **one funding-and-consent core, many destination adapters** — if the demo can only pay one kind of URL, it has missed the thesis.

*(An earlier revision of this plan collapsed onto Stripe alone. That was wrong and has been corrected — Stripe is now one adapter among four.)*

## The three-layer model

Each layer maps to a published standard. This is the whole reason the project starts from existing docs rather than invention.

| Layer | Question it answers | Standard | Verified source |
|---|---|---|---|
| **Funding** | What money is used, in what mix? | UCP split-payments; ACP seller-backed handler | `Universal-Commerce-Protocol/ucp` (3,249★, Apache-2.0, pushed 2026-07-30); `agentic-commerce-protocol` (1,497★, Apache-2.0) |
| **Consent** | Did the human actually authorize this? | AP2 Intent / Cart / Payment mandates | `google-agentic-commerce/AP2` (3,129★, Apache-2.0) |
| **Arrival** | Who is this agent, and for whom does it act? | **Visa TAP** — RFC 9421 HTTP Message Signatures | `visa/trusted-agent-protocol` (188★) |

**TAP is the layer that makes "any URL" tractable.** It is merchant-agnostic by design: the agent signs its HTTP requests (timestamp, session id, key id, algorithm), bound to the destination's domain and the specific operation, so any destination can verify it without a prior relationship. The same signed-request discipline works whether the far end is your storefront, a payment link, or a biller portal. Repo components to mine: `tap-agent/`, `merchant-frontend/`, `merchant-backend/`, `agent-registry/`.

Star counts, licenses, and push dates above were checked live against the GitHub API on 2026-07-30 — measured, not recalled.

## Two gift-card families — both are in scope

These are different instruments and the demo handles both. Conflating them is the single easiest way to get this project wrong.

| | **Closed-loop** | **Open-loop prepaid** |
|---|---|---|
| Example | StreamCo / your storefront's own card | A real Visa gift card off a drugstore rack |
| Identity | An issuer-defined code + PIN | A genuine 16-digit PAN, expiry, CVV |
| Who redeems it | The **merchant**, against its own ledger | The **card network** — it's just a card |
| Spec home | UCP redeemables; ACP `dev.acp.seller_backed.gift_card` | None needed; ordinary card rails |
| In this app | `packages/protocol` ledger draw | Stripe adapter, `PaymentMethod` id |

UCP's `allowed_combinations` grammar exists precisely to express **card + redeemables** together, so supporting both families makes the implementation *more* faithful to the spec, not less.

### The real Visa gift card path

The user's own prepaid card is the capstone's proof that this isn't all simulation.

- **Live mode, decline-only.** Everything is demoed in test mode except one live path: attempt a charge **exceeding** the card's balance and take a genuine `insufficient_funds` decline from the Visa network. E-commerce has no partial authorization, so it's a clean full decline and **no money moves** — a real network failure at zero cost.
- **The PAN must never reach our server.** Capture via **Stripe Elements / PaymentElement** so the card goes browser→Stripe directly; the app only ever holds a `PaymentMethod` id. Never build a form that POSTs a raw card number to our own API — that pulls the project into PCI scope for no benefit.
- **Balance is a hint, not a fact.** No API can query an open-loop prepaid balance. The user records the balance when enrolling the card; the planner uses it for planning but marks it **unverified** and must still handle a decline gracefully. Enrolled balance and reality drift — that's the point of the demo.
- **Register the card's ZIP at the issuer's site before demoing.** Unregistered prepaid cards fail AVS and decline *even with sufficient funds*. Worth a line in the README so nobody debugs their own code for an issuer-side problem.
- Keep live attempts to a handful of small self-charges; high-volume self-payment trips card-testing heuristics.

## Credential rule — one line the whole app obeys

**The agent never holds a raw credential. It holds scoped, revocable tokens.**

This is not a house rule; it is what all three standards independently specify, and stating it once resolves every storage question below.

### What is stored, and where

| Data | Storage | Why |
|---|---|---|
| Open-loop card PAN | **Never stored by us.** Captured via Stripe Elements, browser→Stripe | Storing it — even encrypted — moves the project from PCI SAQ-A to **SAQ-D** (key management, rotation, access logging, quarterly ASV scans, annual pen test). Enormous cost, zero demo value |
| Stripe `PaymentMethod` id (`pm_…`) + `Customer` id | Our DB, per `user_id` | This *is* the enrollment. Agent charges off-session with customer + payment method |
| Card brand, last4, expiry, enrolled balance hint | Our DB | Display and planning only |
| Closed-loop code + PIN | **Hash only**, plus last4 for display | The merchant only ever *verifies* a presented code — it never needs to re-present it, so one-way is correct here |
| Signed mandates, ledger entries, approval decisions | Our DB, append-only | The audit trail; the interesting part to show on screen |

### Why not encrypt-and-decrypt PANs

A hash cannot be decoded — if the agent can recover the number, it was encrypted, not hashed. An encrypted-PAN design is therefore a card vault, and building a card vault badly is strictly worse than not building one. Tokenization gets the identical UX (*enroll once; agent pays later by user id*) with none of the liability, and is more faithful to the specs the project is grounded in.

**Scoping the token is the interesting part, not a compromise.** ACP's Shared Payment Token is bound to a merchant *and* an amount, time-limited and revocable. This project mirrors that directly.

### Scoped payment tokens (ACP-shaped)

Issued at payment time, never at enrollment. Each token binds:

```
{ destination_id, amount_minor, currency, mandate_id, user_id, expires_at, jti }
```

The destination **must** reject a token whose `destination_id` or `amount_minor` doesn't match the request it accompanies, whose `expires_at` has passed, or whose `jti` it has already seen. Enrollment stores a long-lived `pm_…`; the agent never charges with it directly — it exchanges a mandate for a narrowly scoped token, uses it once, and it dies.

This buys three demo moments that plain PaymentMethod reuse cannot:

- **Replay at the wrong destination** — take a token minted for the storefront, present it at StreamCo, watch it refused.
- **Amount tampering** — mint for $20, attempt $200, refused on the `amount_minor` bind.
- **Expiry** — hold a token past its window, refused.

Each is a scripted failure demo, and each is the ACP security model made visible rather than asserted.

## Destination adapters

One interface, four implementations. This is the demo's spine and the thing to put on screen.

```ts
interface PaymentDestination {
  id: string;
  discover(ref: string): Promise<AmountDue>;      // what is owed, in what currency
  capabilities(): Promise<AcceptedInstruments>;   // what it will accept
  pay(plan: InstrumentPlan, mandate: SignedMandate): Promise<PaymentResult>;
  confirm(handle: string): Promise<PaymentStatus>;
}
```

1. **Spec-native merchant** *(you build it; the reference case)* — implements UCP/ACP agentic checkout, declares `capabilities.payment.handlers` including `dev.acp.seller_backed.gift_card`, and honors `allowed_combinations`. Verifies the agent's TAP signature. This is the "everyone did it right" path: discovery is a machine-readable API call.
2. **Hosted payment link** *(Stripe test mode — the real-money leg)* — the agent is handed a URL, must extract the amount, and pays. Proves the system touches at least one genuine rail rather than being mocks all the way down.
3. **Subscription biller portal** *(simulated: "StreamCo")* — a small fake Netflix/Disney+-style account page with a balance due, a due date, and a payment form. Renders as a normal consumer site with **no** machine-readable checkout, so the agent must fall back to reading the page. This is the contrast that makes the standards argument land.
4. **Machine-native paywall** *(x402)* — HTTP `402 Payment Required` with the price in the response headers. `x402-foundation/x402` is the highest-star repo in this space (6,419★) and shows where this is all heading: no page to read, the protocol just states the price.

The capstone's argument writes itself from adapters 1, 3 and 4 side by side: **the better the destination's protocol, the less the agent has to guess.**

### Honest constraint on real billers

The agent **cannot** pay a real Netflix or Disney+ account. Those have no public payment API, automating a login violates their terms, and they're actively bot-defended. StreamCo is a faithful simulation of the *shape* of that problem — balance due, due date, a form, no API — and the writeup should say so directly rather than implying real-biller coverage. This is a limitation of the destination, not of the agent, which is itself a finding worth presenting.

## Architecture

pnpm workspace, TypeScript throughout. The agent reaches every destination **over HTTP only** — no importing merchant code, no shared DB handle. That separation is what makes the demo credible rather than theater.

```
apps/
  web/                Next.js (App Router)
    app/dashboard/      gift-card wallet, spend policy, approval inbox, run timeline
    app/store/          spec-native storefront  (destination 1)
    app/streamco/       simulated biller portal (destination 3)
    app/api/merchant/   agentic checkout API — UCP/ACP-shaped
    app/api/x402/       402-gated endpoint      (destination 4)
    app/api/mandates/   mandate issue + verify
  agent/              standalone Node runtime: planner + destination adapters
packages/
  protocol/           TS types + zod schemas mirroring UCP/ACP/AP2 field names
  tap/                RFC 9421 request signing + verification (shared both ways)
docs/DESIGN.md        what's implemented, which spec each piece comes from, what's faked
```

Storage: **Supabase** (Postgres + Auth + RLS). Auth gives a real `user_id`, which is what makes "the agent acts for *this* user" a demonstrable claim rather than a fixture. Money as **integer minor units** everywhere — never floats.

**RLS is a deliverable, not config.** Supabase's anon key is public by design, so every table carries an explicit policy and each one gets a test that a second user cannot read the first user's wallet, mandates, tokens, or ledger. The agent authenticates as a **service role with its own scoped grants** — never as the user, and never with the anon key.

### Funding core (destination-independent)

Gift cards are closed-loop cards **your storefront issued** — that's *why* they're redeemable there, and the demo should say it out loud rather than hand-wave. Dashboard has two panes: merchant admin issues/seeds cards; the user wallet enrolls one by number + PIN and grants the agent scoped access. Store a hash of number+PIN plus last-4 for display, never the raw pair — matching ACP's rule that the agent never holds raw credentials.

Redemption writes to an **append-only ledger**, so every draw and reversal is auditable. Per UCP, gift cards are submitted **open-amount** (no `amount` field) and the merchant draws up to available balance in priority order; **a zero balance is a valid $0 contribution, not a failure.**

Where a destination can't accept a closed-loop card directly (adapters 2, 3, 4), the split happens on your side: gift-card balance is drawn first and the remainder goes to the destination's own rail. The ledger is the source of truth in every case.

### Agent loop

1. `discover(ref)` — the reference is a cart id, a payment URL, a StreamCo account, or a 402 endpoint. **The planner does not branch on destination type**; the adapter normalizes to `AmountDue`.
2. Load the signed **IntentMandate** (spend cap, destination allowlist, expiry).
3. **Policy gate** — over cap, or destination not allowlisted → raise an approval request and halt. The human-in-the-loop moment.
4. Plan the instrument mix against `capabilities()`.
5. Emit **CartMandate** (attests to the exact amount) and **PaymentMandate** (attests to the mix); sign Ed25519 as JWS via `jose`.
6. `pay()` with a TAP-signed request → `confirm()` → report.

### Failure matrix — build deliberately, this is the strongest demo material

| Scenario | Trigger | Correct behavior |
|---|---|---|
| Gift card short | balance < amount due | Draw next card; if still short, request approval for remainder on the destination's rail |
| Zero-balance card | balance = 0 | **$0 contribution, not an error** — continue (UCP is explicit) |
| Destination declines | Stripe `4000000000000002` | **Reverse every gift-card redemption**, then report |
| 3DS / step-up required | Stripe `4000002500003155` | Escalate to dashboard for human completion |
| Amount moved after quote | mutate the cart or StreamCo balance mid-run | CartMandate mismatch → refuse, re-request approval |
| Over mandate cap | amount exceeds spend cap | Never silently proceed — approval inbox |
| Destination unreadable | StreamCo markup changed | Report inability to determine amount — **never guess a number and pay it** |
| Agent signature rejected | bad/expired TAP key | Destination returns 401; agent reports rather than retrying unsigned |
| **Real prepaid card, over balance** | **live mode**, charge > real Visa gift card balance | Genuine `insufficient_funds` from the network. Reverse closed-loop redemptions, mark the enrolled balance **stale**, report actual vs. assumed |
| Real prepaid card, AVS mismatch | unregistered card ZIP | Surface it as an *issuer-side* fix, not a retry loop — retrying won't help |

The last two matter most for the presentation: an agent that guesses an amount, or that degrades to unsigned requests when rejected, is exactly the failure mode these standards exist to prevent.

Reversal deserves its own test: after a declined payment, gift-card balances must be **exactly** restored.

## Environment notes

- Blocked at this session's proxy (403): `docs.stripe.com`, `ap2-protocol.org`, `agenticcommerce.dev`, `developer.visa.com`, `developer.mastercard.com`. Reachable: `api.github.com`, `raw.githubusercontent.com`. Stripe and TAP work must be written against SDK/spec types from GitHub and verified by **running** it, not by reading vendor portals mid-build.
- Stripe: test mode (`sk_test_`) for all development. A **separate, explicitly flagged** live path exists solely for the real-card decline demo — live keys must be a distinct env var (`STRIPE_LIVE_SECRET_KEY`), never a swapped value of the test one, so live mode can never be entered by accident. The live path refuses to run unless the intended charge **exceeds** the enrolled balance.
- **The repo has no `.gitignore` — create one in the first commit, before any env file exists.** `.env*` must be in it from the start; a live Stripe key committed to a public repo is a real incident, not a hypothetical one.

## Continuing on a local laptop

This project should be built locally, not in the cloud container. Three hard reasons: Stripe Elements needs a real browser, the M5 decline demo needs a physical card in hand, and live Stripe / Supabase service-role keys should not sit in an ephemeral environment. The 403s disappear as a bonus — `docs.stripe.com`, `ap2-protocol.org`, `agenticcommerce.dev`, `developer.visa.com` and `developer.mastercard.com` all become readable, so Stripe and TAP work can be written against real vendor docs instead of inferred from GitHub types.

**First action, before anything else:** commit this plan into the repo as `docs/PLAN.md` on `claude/agentic-payment-docs-feasibility-pedvcq` and push. It currently lives outside the repo and is the only artifact this session has produced — an ephemeral container reclaim would lose it.

**Prerequisites to install locally:**

- Node 20+ and pnpm
- A Stripe account — test keys for M1–M4; live keys **only** for the M5 decline, in a separate env var
- A Supabase project (or local Postgres via the Supabase CLI for development)
- The physical Visa gift card, **with its ZIP registered at the issuer's site** before attempting M5

Then `git pull` the branch and pick up at M1.

## Milestones

Each is independently demoable, so there are clean stop-early points.

- **M1 — Funding core.** Workspace, `.gitignore`, Supabase schema + Auth + RLS policies, gift-card ledger with redeem + reverse, merchant admin pane. *Demo: sign in, issue a card, redeem it, watch the ledger — and watch a second user fail to see any of it.*
- **M2 — Destination interface + adapters 1 and 2.** Spec-native storefront and Stripe payment link, agent pays via both through the same planner. *Demo: same agent, two destinations, no branching in the planner.*
- **M3 — Mandates + TAP + scoped tokens.** Intent/Cart/Payment mandates signed and verified; RFC 9421 signing in `packages/tap`; mandate→scoped-token exchange; destinations enforce the bind; policy gate and approval inbox live. *Demo: over-limit purchase pauses for you; a tampered mandate is rejected; a token replayed at the wrong destination is refused.*
- **M4 — Adapters 3 and 4 + failure matrix.** StreamCo biller and x402 paywall; every test-mode failure row; run timeline showing each step, the mandate JSON, and ledger before/after. *Demo: four destinations, one agent — and the decline that correctly gives your balance back.*
- **M5 — The real card.** Stripe Elements enrollment (PAN never hits our server), enrolled-balance-as-hint in the planner, and the guarded live decline path. *Demo: your actual Visa gift card, a real over-balance attempt, a real network decline, and the agent recovering correctly.* This is the closing beat of the presentation — everything before it could be simulation; this can't be.

## Verification

1. `pnpm --filter agent demo:<destination>` for each of the four — assert each reaches a terminal state and the ledger balances.
2. **Planner-independence test:** run all four through the same planner and assert no destination-specific branching outside the adapters (this is the architectural claim — test it, don't just assert it).
3. `demo:decline` — assert gift-card balances are byte-identical to pre-run values and the order is not marked paid.
4. `demo:overlimit` — assert the run halts pending approval with **no** ledger write beforehand.
5. Tamper one byte of a signed CartMandate → assert rejection. Strip the TAP signature → assert 401.
5a. **Scoped-token binds:** replay a storefront token at StreamCo → refused; mint for $20 and attempt $200 → refused; present an expired token → refused; present the same `jti` twice → refused.
5b. **RLS:** as user B, attempt to read user A's wallet, mandates, tokens and ledger — every one must return empty, not filtered-in-app. Test against the anon key, since that is what an attacker holds.
5c. **No-PAN invariant:** grep the entire schema and all logs for any stored 16-digit sequence; assert zero matches. Run this in CI so it can't regress.
6. Break StreamCo's markup → assert the agent reports inability rather than paying a guessed amount.
7. Cross-check `docs/DESIGN.md`: every spec claim carries a `raw.githubusercontent.com` URL and retrieval date; everything simulated (StreamCo, issued gift cards) is labeled as such.
8. **Live-mode guards (assert before ever running live):** live path refuses when `amount <= enrolledBalance`; live keys read only from `STRIPE_LIVE_SECRET_KEY`; no code path can reach a live client from a test-mode run. Verify by unit test, not by trying it.
9. **Real-card run (M5, once):** enroll the Visa gift card via Elements, confirm no PAN appears in server logs or the DB (grep the ledger and logs for any 16-digit sequence), then attempt an over-balance charge and capture the genuine decline code.
10. Screen-record M4 and M5 — those are the artifacts you present.

Then commit to `claude/agentic-payment-docs-feasibility-pedvcq`, push with `-u origin`, open a **draft** PR.
