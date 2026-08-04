# Plan: `pay-agent` — Gift-Card-Funded Payment Agent (Capstone)

## Context

`pay-agent` is an empty repo — one README line: *"POC Agent that can use gift cards to make payments on behalf of user."*

The capstone demonstrates: **a user loads gift cards into a dashboard; an agent then goes to some place that wants money, works out what's owed, decides how to pay from that funding, gets human approval when it should, pays, and handles failure sensibly.**

The critical word is **some place**. Stripe is one destination, not the point. A subscription biller (the Netflix / Disney+ archetype), a spec-native agentic storefront, and a machine-native API paywall are all destinations too. The architecture's main axis is therefore **one funding-and-consent core, many destination adapters** — if the demo can only pay one kind of URL, it has missed the thesis.

*(An earlier revision of this plan collapsed onto Stripe alone. That was wrong and has been corrected — Stripe is now one adapter among several.)*

## Scope decisions

Settled **2026-07-30**. These are recorded so no later session has to infer them.

| Question | Decision |
|---|---|
| Judged on | A working live demo **and** a written findings piece |
| Audience | Employer / portfolio piece |
| Timeline | Open-ended |
| Irreducible core | A gift card actually pays for something (M1+M2) |
| Card families | **Both** — the contrast is the point |
| Spine standard | **UCP**, with AP2 and TAP layered where they add story |
| Storefront | **Adapt** UCP's official TypeScript sample |
| Storage | **SQLite now, Supabase later** |
| Delivery | Public repo + recorded video + deployed demo |
| Live mode | **Decline-only** — no money moves |
| Destinations | UCP storefront, Stripe payment link, StreamCo (**x402 dropped**) |
| Deployed keys | **Test mode only**; live keys never leave the laptop |
| Consent layer | **Simplified** — approval gate + audit trail; heavy crypto is a stretch goal |
| Write-up | GitHub Pages |
| Git flow | Branch per milestone, squash to main |

Assets on hand: Stripe test **and** live keys, plus the physical Visa gift card. No
Supabase account yet.

**Guiding rule: prefer the official reference implementation over anything hand-rolled.**
Where a standards body or payment network already publishes an SDK, a sample, or a
conformance suite, this project uses it rather than inventing an equivalent. Several
sections below changed on 2026-07-30 for exactly this reason, and each says so inline.

## The three-layer model

Each layer maps to a published standard. This is the whole reason the project starts from existing docs rather than invention.

| Layer | Question it answers | Standard | Verified source |
|---|---|---|---|
| **Funding** | What money is used, in what mix? | UCP split-payments; ACP seller-backed handler | `Universal-Commerce-Protocol/ucp` (3,251★, Apache-2.0, pushed 2026-07-31); `agentic-commerce-protocol` (1,497★, Apache-2.0) |
| **Consent** | Did the human actually authorize this? | AP2 Intent / Checkout / Payment mandates | `google-agentic-commerce/AP2` (3,129★, Apache-2.0) |
| **Arrival** | Who is this agent, and for whom does it act? | **RFC 9421** HTTP Message Signatures, as profiled by Visa TAP | IETF RFC 9421; `visa/trusted-agent-protocol` (189★) — **reference only, see below** |

### UCP tooling — the reason UCP is the spine

UCP is the only one of the three that ships a complete, current toolchain in our language:

| Source | What it gives us |
|---|---|
| `Universal-Commerce-Protocol/samples` → `rest/nodejs` | A **TypeScript** UCP merchant: `src/api/{checkout,discovery,order}.ts` plus seven test files. Stack: Hono, zod, `better-sqlite3`, `@ucp-js/sdk` |
| `@ucp-js/sdk` (npm) | Official JS SDK — v0.4.4, Apache-2.0, published 2026-07-30 |
| `Universal-Commerce-Protocol/conformance` | **Official conformance tests**, with `test_data/flower_shop` fixtures |
| `ucp.dev` | Spec and docs, including official UCP↔AP2 layering guidance |

**Verified 2026-07-30:** `samples/rest/nodejs` clones, installs and runs clean on this
machine — **28/28 tests pass, 0 vulnerabilities**. That is why M1 adapts it rather than
starting from an empty directory, and why "SQLite now" is cheap: we inherit the sample's
own storage choice.

The conformance suite is the highest-value item here. It turns "this follows the
standard" from a claim in the writeup into a green test run against the standards body's
own tests — much stronger evidence than tests we wrote ourselves.

### Arrival layer: implement RFC 9421, don't vendor Visa's repo

TAP is what makes "any URL" tractable: the agent signs its HTTP requests (timestamp,
session id, key id, algorithm), bound to the destination's domain and the specific
operation, so any destination can verify it without a prior relationship. That discipline
works whether the far end is our storefront, a payment link, or a biller portal.

But `visa/trusted-agent-protocol` is **read-only reference, not a dependency**:

- **It is not open source.** GitHub reports `NOASSERTION`; its `LICENSE.md` binds use to
  the Visa Developer Center Terms of Use. Copying code from it into this repo is a
  licensing problem, not a style preference.
- **It is stale.** Last pushed `2025-10-28` — nine months, while UCP, ACP and x402 all
  pushed within the last two weeks.
- **It is the wrong shape.** `tap-agent/` is a Python **Streamlit test harness** driving
  Playwright — an interactive testing UI, not a signing library. There is nothing to lift
  into a TypeScript `packages/tap`.

So the normative source is **RFC 9421 itself** (IETF, open), which Visa's own
documentation cites as the standard it implements; Visa's spec page supplies the
TAP-specific header and field requirements. We take **no third-party signing dependency**
either. Note that signing is a **stretch goal** under the simplified consent layer.

Star counts, licenses, push dates and the sample's test run above were all checked live
on 2026-07-30 — measured, not recalled.

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

### Scoped payment tokens — use Stripe's, don't hand-roll

*Revised 2026-07-30.* An earlier draft of this section designed a bespoke token binding
`{destination_id, amount_minor, currency, mandate_id, user_id, expires_at, jti}`, with our
own replay and tamper checks. **Stripe already ships this**, so we use the real thing:

- `SharedPaymentIssuedToken` / `SharedPaymentGrantedToken`
- Endpoints under `/v1/shared_payment/granted_tokens`, including **revoke**
- **Test-helper endpoints** for creating and revoking tokens, which is what makes the
  failure demos below scriptable
- Shipped: changelog entries dated `2026-04-22`

Semantics are the ones we wanted: a limited-use, merchant-scoped, revocable reference to a
PaymentMethod. Enrollment stores a long-lived `pm_…`; the agent never charges with it
directly — it exchanges a mandate for a narrowly scoped token, uses it once, and it dies.

**Fallback:** StreamCo has no issuer, so for that destination only we mint our own token
carrying the same fields. It is explicitly the simulation, and the writeup must say so.

This buys three demo moments that plain PaymentMethod reuse cannot:

- **Replay at the wrong destination** — take a token minted for the storefront, present it elsewhere, watch it refused.
- **Amount tampering** — mint for $20, attempt $200, refused on the amount bind.
- **Expiry** — hold a token past its window, refused.

Because these run against Stripe's own controls rather than ours, they demonstrate a real
payment network refusing a bad request instead of our code marking its own homework —
which is the whole point of grounding the project in shipped standards.

## Destination adapters

One interface, three implementations. This is the demo's spine and the thing to put on screen.

```ts
interface PaymentDestination {
  id: string;
  discover(ref: string): Promise<AmountDue>;      // what is owed, in what currency
  capabilities(): Promise<AcceptedInstruments>;   // what it will accept
  pay(plan: InstrumentPlan, mandate: SignedMandate): Promise<PaymentResult>;
  confirm(handle: string): Promise<PaymentStatus>;
}
```

1. **Spec-native merchant** *(adapted from UCP's official sample; the reference case)* — implements UCP agentic checkout, declares `capabilities.payment.handlers` including `dev.acp.seller_backed.gift_card`, and honors `allowed_combinations`. This is the "everyone did it right" path: discovery is a machine-readable API call.
2. **Hosted payment link** *(Stripe test mode — the real-rails leg)* — the agent is handed a URL, must extract the amount, and pays. Proves the system touches at least one genuine rail rather than being mocks all the way down. This is also where the open-loop Visa prepaid card is used.
3. **Subscription biller portal** *(simulated: "StreamCo")* — a small fake Netflix/Disney+-style account page with a balance due, a due date, and a payment form. Renders as a normal consumer site with **no** machine-readable checkout, so the agent must fall back to reading the page. This is the contrast that makes the standards argument land.

*Dropped 2026-07-30: a fourth adapter, an x402 machine-native paywall. It remains the
most interesting signpost for where this is heading (`x402-foundation/x402`, 6,423★), but
it is a stretch goal — the argument below does not need it.*

The capstone's argument comes from adapters 1 and 3 as two clean poles: **the better the
destination's protocol, the less the agent has to guess.** Adapter 1 hands the agent a
machine-readable amount; adapter 3 makes it read a page and risk being wrong. Adapter 2
sits in between and supplies the real money.

### Honest constraint on real billers

The agent **cannot** pay a real Netflix or Disney+ account. Those have no public payment API, automating a login violates their terms, and they're actively bot-defended. StreamCo is a faithful simulation of the *shape* of that problem — balance due, due date, a form, no API — and the writeup should say so directly rather than implying real-biller coverage. This is a limitation of the destination, not of the agent, which is itself a finding worth presenting.

## Architecture

pnpm workspace, TypeScript throughout. The agent reaches every destination **over HTTP only** — no importing merchant code, no shared DB handle. That separation is what makes the demo credible rather than theater.

```
apps/
  store/              UCP storefront (destination 1) — adapted from
                        Universal-Commerce-Protocol/samples/rest/nodejs
                        Hono + zod + better-sqlite3 + @ucp-js/sdk
                        serves /.well-known/ucp
  web/                Next.js (App Router)
    app/dashboard/      gift-card wallet, spend policy, approval inbox, run timeline
    app/streamco/       simulated biller portal (destination 3)
    app/api/mandates/   mandate issue + verify
  agent/              standalone Node runtime: planner + destination adapters
packages/
  protocol/           TS types + zod schemas mirroring UCP/ACP/AP2 field names
  db/                 repository interface + SQLite implementation
                        NOTHING outside this package imports better-sqlite3
  tap/                RFC 9421 request signing + verification (stretch goal)
docs/DESIGN.md        what's implemented, which spec each piece comes from, what's faked
```

Storage: **SQLite now, Supabase later** — see the funding core section for why the
repository boundary in `packages/db` is load-bearing. Money as **integer minor units**
everywhere — never floats.

Until Supabase lands there is no real auth, so "the agent acts for *this* user" is carried
by a fixture `user_id` rather than a verified session. That is a **known limitation to
state in the writeup**, not something to paper over.

### Funding core (destination-independent)

Gift cards are closed-loop cards **your storefront issued** — that's *why* they're redeemable there, and the demo should say it out loud rather than hand-wave. Dashboard has two panes: merchant admin issues/seeds cards; the user wallet enrolls one by number + PIN and grants the agent scoped access. Store a hash of number+PIN plus last-4 for display, never the raw pair — matching ACP's rule that the agent never holds raw credentials.

Redemption writes to an **append-only ledger**, so every draw and reversal is auditable. Per UCP, gift cards are submitted **open-amount** (no `amount` field) and the merchant draws up to available balance in priority order; **a zero balance is a valid $0 contribution, not a failure.**

Where a destination can't accept a closed-loop card directly (adapters 2 and 3), the split happens on your side: gift-card balance is drawn first and the remainder goes to the destination's own rail. The ledger is the source of truth in every case.

#### Emit the standard wire shape from the first commit

*Added 2026-07-30.* Stripe registers a UCP payment handler `com.stripe.payments` (handler
id `stripe_payments`), advertised at `/.well-known/ucp`. Its instrument list already
includes what this project is about:

| Instrument | Tokenization | Relevance here |
|---|---|---|
| `card` | Required | The open-loop Visa prepaid path |
| **`gift_card`** | **Not required** | Business-issued gift cards, submitted directly |
| **`store_credit`** | **Not required** | Business-managed balances |

Payment is submitted as an **`instruments[]` array**, so "card + gift card in one payment"
is the standard's native shape rather than something we invent. M1 therefore emits that
shape and serves `/.well-known/ucp` from the start, instead of defining a private contract
and mapping onto the standard later.

#### Storage: SQLite now, Supabase later

The data layer starts on SQLite (inherited from UCP's sample) and may move to Supabase for
the Auth + RLS story. **That migration is only cheap if nothing outside `packages/db`
imports `better-sqlite3`.** All persistence goes behind a repository interface in M1 —
this is the single most important structural decision in the project, because getting it
wrong turns a migration into a rewrite.

If and when Supabase lands, RLS is a deliverable, not config: Supabase's anon key is
public by design, so every table carries an explicit policy, each gets a test that a
second user cannot read the first user's wallet, mandates, tokens or ledger, and the agent
authenticates as a **service role with its own scoped grants** — never as the user, and
never with the anon key.

### Agent loop

1. `discover(ref)` — the reference is a cart id, a payment URL, or a StreamCo account. **The planner does not branch on destination type**; the adapter normalizes to `AmountDue`.
2. Load the signed **IntentMandate** (spend cap, destination allowlist, expiry).
3. **Policy gate** — over cap, or destination not allowlisted → raise an approval request and halt. The human-in-the-loop moment.
4. Plan the instrument mix against `capabilities()`.
5. Emit **CheckoutMandate** (attests to the exact amount) and **PaymentMandate** (attests to the mix).
6. `pay()` → `confirm()` → report.

#### Mandate naming and format

*Corrected 2026-07-30.* An earlier draft called step 5's first credential a "CartMandate"
and specified plain Ed25519 JWS via `jose`. Both were wrong against the official
UCP↔AP2 guidance, which names:

- **`CheckoutMandate`** — a hash of the checkout state
- **`PaymentMandate`** — an **SD-JWT-VC** encoding the payment authorization

AP2 is the trust layer, carrying these as Verifiable Digital Credentials, and requires
UCP's checkout capability enabled as a dependency.

**What we build:** the simplified consent layer signs these as plain JWS rather than
SD-JWT-VC — but uses the **correct names and field semantics**, so the implementation is
deliberately *simpler* than the spec and never *wrong* about it. `docs/DESIGN.md` must say
plainly which parts are simplified. Full SD-JWT-VC is a stretch goal.

Separately, ACP's `rfc.seller_backed_payment_handler.md` confirms the
`dev.acp.seller_backed.gift_card` handler name used above is correct, and adds a
**`delegate_payment`** tokenization step this plan originally omitted. Note its status
honestly: it is an RFC, not ratified spec.

### Failure matrix — build deliberately, this is the strongest demo material

| Scenario | Trigger | Correct behavior |
|---|---|---|
| Gift card short | balance < amount due | Draw next card; if still short, request approval for remainder on the destination's rail |
| Zero-balance card | balance = 0 | **$0 contribution, not an error** — continue (UCP is explicit) |
| Destination declines | Stripe `4000000000000002` | **Reverse every gift-card redemption**, then report |
| 3DS / step-up required | Stripe `4000002500003155` | Escalate to dashboard for human completion |
| Amount moved after quote | mutate the cart or StreamCo balance mid-run | CheckoutMandate mismatch → refuse, re-request approval |
| Over mandate cap | amount exceeds spend cap | Never silently proceed — approval inbox |
| Destination unreadable | StreamCo markup changed | Report inability to determine amount — **never guess a number and pay it** |
| Agent signature rejected *(stretch — only once TAP signing exists)* | bad/expired signing key | Destination returns 401; agent reports rather than retrying unsigned |
| **Real prepaid card, over balance** | **live mode**, charge > real Visa gift card balance | Genuine `insufficient_funds` from the network. Reverse closed-loop redemptions, mark the enrolled balance **stale**, report actual vs. assumed |
| Real prepaid card, AVS mismatch | unregistered card ZIP | Surface it as an *issuer-side* fix, not a retry loop — retrying won't help |

The last two matter most for the presentation: an agent that guesses an amount, or that degrades to unsigned requests when rejected, is exactly the failure mode these standards exist to prevent.

Reversal deserves its own test: after a declined payment, gift-card balances must be **exactly** restored.

## Environment notes

*Rewritten 2026-07-30, now running on the local laptop.* The 403s recorded in the original
draft were an artifact of the cloud container. No proxy is configured here and all five
domains return 200 — but a 200 is not the same as readable content, and they fall into
three tiers:

| Domain | Readable? | Notes |
|---|---|---|
| `docs.stripe.com` | **Fully** | Deep pages 440KB–4.0MB |
| `ap2-protocol.org` | **Fully** | Paths are `/ap2/…`; bare `/specification/` 404s |
| `agenticcommerce.dev` | **Fully** | Paths are `/docs/reference/…`, not `/specs/…` |
| `ucp.dev` | **Fully** | Not known to the original draft; the richest source |
| `developer.visa.com` | Landing page only | JS-rendered; the real spec content is elsewhere |
| `developer.mastercard.com` | **No** | 1,629-byte JS shell on *every* path, empty even through a rendering fetcher |

So the original instruction to infer Stripe types from GitHub is **obsolete** — write
against the real vendor docs. Two standing notes:

- **Mastercard remains unreadable**, and their GitHub org publishes no Agent Pay repo.
  Nothing in this plan depends on Mastercard; recorded so no future session re-probes it.
- **Do not guess doc URLs.** Both AP2 and ACP use path prefixes that differ from the
  obvious guess. Use the appendix at the end of this document.

Other environment constraints, unchanged:

- Stripe: test mode (`sk_test_`) for all development. A **separate, explicitly flagged** live path exists solely for the real-card decline demo — live keys must be a distinct env var (`STRIPE_LIVE_SECRET_KEY`), never a swapped value of the test one, so live mode can never be entered by accident. The live path refuses to run unless the intended charge **exceeds** the enrolled balance.
- **The deployed demo is test-mode only.** The hosted build must **fail at startup** if `STRIPE_LIVE_SECRET_KEY` is present. A public URL and live card rails must never meet; the guard is mechanical, not a matter of discipline.
- `.gitignore` landed with the first commit, before any env file existed. A live Stripe key committed to a public repo is a real incident, not a hypothetical one.

## Continuing on a local laptop

This project is built locally, not in a cloud container. Three hard reasons, all still
valid: Stripe Elements needs a real browser, the live decline demo needs a physical card
in hand, and live payment keys should not sit in an ephemeral environment. Readable vendor
docs are a bonus on top.

**The original "first action" is done.** This plan is now committed. It is worth recording
*how* narrowly that worked: the container was reclaimed before the plan was ever pushed,
and the file survived only because it had been downloaded and copied back in by hand. The
warning in the original draft was correct, and it very nearly cost the artifact.

**Prerequisites:**

- Node 20+ and pnpm
- A Stripe account — test keys throughout; live keys **only** for the decline demo, in a separate env var
- The physical Visa gift card, **with its ZIP registered at the issuer's site** before attempting the live decline
- *(Later, if the Supabase migration happens)* a Supabase project

## Milestones

Each is independently demoable, so there are clean stop-early points.

*Revised 2026-07-30 against the scope decisions at the top.*

- **M1 — Funding core. ✅ Done 2026-07-31** *(PR #2)*. pnpm workspace; adapt `samples/rest/nodejs` into `apps/store`; repository interface in `packages/db` over SQLite; append-only ledger with redeem + reverse; merchant admin pane. Enroll **both** card families — closed-loop by code+PIN (**hash only**, plus last4), open-loop via **Stripe Elements** so the PAN never reaches our server and we hold only a `pm_…`. Serve `/.well-known/ucp`. *Demo: issue a card, redeem it, watch the ledger.*
  - **Shipped beyond the plan:** the card rail itself. Settling the whole `instruments[]` array needed something for the remainder to fall through to, and upstream's mock token handler proves nothing — so `com.stripe.payments` is a real Stripe integration in test mode, authorize-then-capture, verified end to end by `stripe-check`. That was M2's "remainder to the card rail", pulled forward because M1 could not be honestly demonstrated without it.
  - **Not as described:** the "merchant admin pane" is three scripts (`seed`, `issue-card`, `show-ledger`) plus the `/enroll` page, not a UI. Enough to run and demo the funding core; a fuller surface is not on the critical path.
  - 81 tests, typecheck and build clean. Detail in [`DESIGN.md`](./DESIGN.md).
- **M2 — Destinations + the money story. ← the irreducible core.** `PaymentDestination` interface; UCP storefront and Stripe payment link (test mode). Split payment: gift card drawn first, remainder to the card rail. *Demo: a gift card actually pays for something, across two destinations, through one planner with no branching.*
  - **Done — the money story, and a human surface for it** *(2026-08-01)*. `apps/web`: a Next.js storefront, wallet and checkout over the existing store. The split is now something you can watch happen: the checkout states what the gift card will draw and what the card will be authorized for *before* you commit, and refuses to guess where a balance isn't knowable. `scripts/pay-e2e.mjs` drives both paths through a real browser against the real store — a $75.00 order settling $20.00 of gift card and $55.00 of card, and an `insufficient_funds` decline whose claim that balances were restored is checked against the ledger, not asserted.
    - `GET /products` was added to the store; the catalogue had no list endpoint, so a browse surface had nothing to read.
    - **Still open for M2:** the `PaymentDestination` interface and the second destination (the Stripe payment link). What exists is one destination with a real UI, not yet two behind one planner — so the planner-independence claim in *Verification* is still untested.
- **M3 — StreamCo + simplified consent.** The scraped biller portal; policy gate, approval inbox, `CheckoutMandate` as plain JWS, append-only audit trail; Stripe Shared Payment Tokens with the bind demos. Every test-mode failure row, including reversal. *Demo: an over-limit purchase pauses for you; a decline gives your balance back exactly.*
- **M4 — The real card** *(local only, recorded)*. Enrolled-balance-as-hint in the planner and the guarded live decline path. *Demo: your actual Visa gift card, a real over-balance attempt, a real network decline, and the agent recovering correctly.* The closing beat — everything before it could be simulation; this can't be.
- **M5 — Publish.** GitHub Pages write-up, deployed test-mode demo, recorded video.

**Stretch goals, explicitly optional:** SD-JWT-VC mandates, RFC 9421 TAP signing, the
Supabase + RLS migration, and the x402 adapter.

## Verification

0. **Before adapting the sample** *(done 2026-07-30 — 28/28 pass, 0 vulnerabilities)*: clone `Universal-Commerce-Protocol/samples`, then `cd rest/nodejs && npm i && npm test`. If the reference merchant's own suite ever fails on this machine, stop and re-check the plan's foundation before building on it.
1. `pnpm --filter agent demo:<destination>` for each destination — assert each reaches a terminal state and the ledger balances.
2. **Planner-independence test:** run every destination through the same planner and assert no destination-specific branching outside the adapters (this is the architectural claim — test it, don't just assert it).
3. `demo:decline` — assert gift-card balances are byte-identical to pre-run values and the order is not marked paid.
4. `demo:overlimit` — assert the run halts pending approval with **no** ledger write beforehand.
5. Tamper one byte of a signed CheckoutMandate → assert rejection.
5a. **Scoped-token binds** (against Stripe's test helpers where the destination is Stripe-backed): replay a storefront token elsewhere → refused; mint for $20 and attempt $200 → refused; present an expired token → refused; present the same token twice → refused.
5b. **No-PAN invariant** *(done — `packages/db/test/invariants.test.ts`, enforced in CI)*: grep the entire schema and all logs for any stored 16-digit sequence; assert zero matches. It runs as its own named step in `.github/workflows/ci.yml`, ahead of the full suite, so the check the PCI posture rests on fails first and loudly. A companion test guards the guard, after the first version matched a comment of my own containing the words "No PAN".
5c. *(Only once Supabase lands)* **RLS:** as user B, attempt to read user A's wallet, mandates, tokens and ledger — every one must return empty, not filtered-in-app. Test against the anon key, since that is what an attacker holds.
6. Break StreamCo's markup → assert the agent reports inability rather than paying a guessed amount.
7. **UCP conformance suite** run against our storefront — this is the headline evidence that the project follows the standard, and is worth citing directly in the writeup.
8. Cross-check `docs/DESIGN.md`: every spec claim carries a URL and retrieval date; everything simulated (StreamCo, issued gift cards) and everything simplified (JWS instead of SD-JWT-VC, fixture `user_id`) is labeled as such.
9. **Live-mode guards (assert before ever running live):** live path refuses when `amount <= enrolledBalance`; live keys read only from `STRIPE_LIVE_SECRET_KEY`; no code path can reach a live client from a test-mode run; **the deployed build refuses to boot if a live key is present**. Verify by unit test, not by trying it. *(Three of the four done in M1 — `assertSafeStripeConfig` runs before the server binds a port, and the live client is a separate function checkout cannot reach. The `amount <= enrolledBalance` refusal lands with the live path itself in M4.)*
10. **Real-card run (M4, once):** enroll the Visa gift card via Elements, confirm no PAN appears in server logs or the DB, then attempt an over-balance charge and capture the genuine decline code.
11. Screen-record the failure matrix and the real-card decline — those are the artifacts you present.

## Appendix — verified sources

Retrieved and measured **2026-07-30**. Paths matter: several of these differ from the
obvious guess, and guessing produced 404s.

| Topic | URL |
|---|---|
| UCP spec & docs | `https://ucp.dev/documentation/core-concepts/` |
| UCP ↔ AP2 layering | `https://ucp.dev/documentation/ucp-and-ap2/` |
| UCP reference merchant (TS) | `github.com/Universal-Commerce-Protocol/samples` → `rest/nodejs` |
| UCP JS SDK | npm `@ucp-js/sdk` v0.4.4, Apache-2.0 |
| UCP conformance tests | `github.com/Universal-Commerce-Protocol/conformance` |
| AP2 specification | `https://ap2-protocol.org/ap2/specification/` |
| AP2 payment mandate | `https://ap2-protocol.org/ap2/payment_mandate/` |
| AP2 agent authorization | `https://ap2-protocol.org/ap2/agent_authorization/` |
| ACP checkout reference | `https://agenticcommerce.dev/docs/reference/checkout` |
| ACP payments reference | `https://agenticcommerce.dev/docs/reference/payments` |
| ACP seller-backed handler RFC | `raw.githubusercontent.com/agentic-commerce-protocol/agentic-commerce-protocol/main/rfcs/rfc.seller_backed_payment_handler.md` |
| Stripe UCP payments handler | `https://docs.stripe.com/agentic-commerce/ucp/stripe-payments-handler` |
| Stripe Shared Payment Tokens | `https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens` |
| Stripe shared-payment API | `https://docs.stripe.com/api/shared-payment/granted-token` |
| Stripe Payment Element | `https://docs.stripe.com/payments/payment-element` |
| Stripe test cards | `https://docs.stripe.com/testing` |
| Visa TAP (reference only) | `https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications` |
| RFC 9421 | IETF — the normative source for HTTP Message Signatures |

**Unreachable:** `developer.mastercard.com` (JS shell on every path; no Agent Pay repo in
their GitHub org). Nothing here depends on it.
