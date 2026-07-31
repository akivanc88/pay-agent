# DESIGN — what's implemented, where each piece comes from, what's faked

This document exists to make one thing impossible: **claiming more than the code does.**

An agentic-payments demo is unusually easy to oversell. Much of it necessarily runs in
test mode against simulated destinations, and a reader has no way to tell a genuine
protocol implementation from a convincing mock unless the project says so plainly. So
every component below carries a status, a source, and — where it deviates from the
standard — the reason.

**Companion document:** [`PLAN.md`](./PLAN.md) is the plan and the argument. This is the
record of what was actually built. Where they disagree, this document is right.

## How to read this

| Status | Meaning |
|---|---|
| **Real** | Genuine implementation against a live external system. No simulation. |
| **Standard** | Implements a published spec faithfully, verified against that spec. |
| **Simplified** | Deliberately less than the spec, using the spec's own names and semantics. The gap is stated. |
| **Simulated** | A stand-in for a system we cannot or should not touch. Not a real integration. |
| **Planned** | Not built yet. |

The three that matter are **Simplified** and **Simulated** versus **Real** — those are
the lines a reader would otherwise have to guess at.

## Status

**M1 substantially working, and the card rail is now real.** Gift cards are a live UCP
payment instrument: the storefront advertises the handler, settles a whole `instruments[]`
array, and gives every cent back when a payment fails. Whatever the gift cards cannot cover
is authorized against **Stripe in test mode** — real API calls, real PaymentIntents, real
decline codes. The remaining simulation on this path is Stripe's test issuer, not our code.

Currency is **CAD** throughout, matching the Stripe account and the physical gift card used
for the eventual live decline. Charging in another presentment currency would put a
conversion between the enrolled balance and the amount authorised, making
"the charge exceeds the balance" approximate — and that comparison is the entire basis of
the guarded live path.

Verified end to end over HTTP against the real Stripe API, not just in tests. `stripe-check`
starts the storefront on a socket, completes a split checkout, and then asks **Stripe** what
happened rather than asking our own code:

```
Stripe key accepted  livemode=false  settlement_currencies=CAD

── card that works ─────────────────────────────────────────
  cart $35.00   gift card ••••8909 $25.00
  HTTP 200  order ord_38f338ee-e1bb-4ccc-9280-d1642ed85abd
  Stripe pi_3Tz7fRBaji74YJFk0sAviohQ  $10.00 CAD  status=succeeded  captured=$10.00  livemode=false
  gift card $25.00 → $0.00

── card that declines: insufficient funds ──────────────────
  cart $35.00   gift card ••••2000 $25.00
  HTTP 402  insufficient_funds Card authorization failed: Your card has insufficient funds.
  Stripe pi_3Tz7fUBaji74YJFk1zf8Z9wl  $10.00 CAD  status=requires_payment_method  captured=$0.00
  gift card $25.00 → $25.00
```

The two numbers that matter: the card was asked for **$10.00**, not $35.00 — the remainder,
not the total — and the declined run left the gift card at **exactly** its opening balance
with nothing captured on the rail.

    pnpm --filter @pay-agent/store seed          # catalogue
    pnpm --filter @pay-agent/store issue-card GC-DEMO-0001 1234 25.00
    pnpm --filter @pay-agent/store stripe-check  # real split checkout, both outcomes
    pnpm --filter @pay-agent/store show-ledger   # before/after

### Authorize now, capture last

Both legs of a payment are provisional until the order exists, and for the same reason. A
gift-card draw is undone by a compensating ledger entry; a card authorization is undone by
cancelling it. So the card is authorized with `capture_method: "manual"` **before** stock is
reserved, and captured only once the order is certain — the last thing that can fail is
already done.

The failure this exists for: a cart goes out of stock between authorization and fulfilment.
Money is committed on two rails before the merchant knows it can ship, and both have to come
back. Capturing at authorization time would have charged a real card for an order that was
never placed.

## Component map

| Component | Source of truth | Status |
|---|---|---|
| Gift-card ledger (`packages/db`) | UCP redeemables semantics | **Standard** — open-amount draws, $0 contributions, exact reversal |
| Storage boundary (`packages/db`) | This project's own design | **Real** — enforced by a test that scans the tree |
| Closed-loop card credentials | ACP "agent never holds a raw credential" | **Real** — HMAC lookup + salted slow KDF |
| UCP storefront (`apps/store`) | Adapted from the official `samples/rest/nodejs` | **Standard** — upstream's 28 tests still pass |
| UCP discovery (`/.well-known/ucp`) | UCP spec + Stripe's handler doc | **Standard** — advertises `dev.acp.seller_backed.gift_card` and `com.stripe.payments` |
| Gift-card instrument settlement | ACP seller-backed handler RFC | **Standard** — settles the whole `instruments[]` array |
| Card rail (`com.stripe.payments`) | Stripe PaymentIntents | **Real** — test mode, authorize/capture, genuine decline codes |
| Split payment across both rails | UCP `instruments[]` | **Real** — the card is authorized for the remainder only |
| Live-mode guards | This project's own design | **Real** — refuses to boot deployed with a live key; five tests |
| Open-loop card enrollment | Stripe Elements | **Planned** — the ledger holds the record; nothing captures a `pm_…` yet |
| Mock token handler | Upstream sample | **Simulated** — retained so the reference merchant's own tests still pass |
| Scoped payment tokens | Stripe Shared Payment Tokens | Planned |
| `CheckoutMandate` / `PaymentMandate` | AP2, via UCP↔AP2 layering guidance | Planned |
| Policy gate + approval inbox | This project's own design | Planned |
| Stripe payment link destination | Stripe | Planned |
| StreamCo biller destination | — (no spec; it's a simulation) | Planned |
| Agent request signing (`packages/tap`) | RFC 9421, as profiled by Visa TAP | Planned — stretch goal |

### What the ledger guarantees, and how

Three properties are structural rather than maintained by convention, because each is
something the demo has to be able to *prove* rather than assert:

- **No balance column exists.** A balance is the signed sum of a card's entries, so it
  cannot drift away from them, and a reversal restores it exactly.
- **The ledger is append-only, enforced by database triggers.** `UPDATE` and `DELETE` on
  `ledger_entries` are rejected outright; a reversal is a new compensating row. Tests
  assert this against raw SQL that bypasses the repository, since the guarantee needs to
  hold against callers that skip our code.
- **A draw can be reversed at most once**, enforced by a unique index — a declined payment
  can legitimately be reported twice, and the second report must not hand out free money.

Entries carry a monotonic `seq`. Ordering by timestamp was not sufficient: several
entries in one run land inside the same millisecond, and the original tie-break on a
random id returned the trail shuffled. An audit trail that cannot reproduce its own
sequence is not an audit trail.

## What is simulated, and why

Stating this plainly is not a disclaimer; it is the finding.

### StreamCo — the subscription biller

**A simulation, deliberately.** The agent cannot pay a real Netflix or Disney+ account:
there is no public payment API, automating a login violates their terms of service, and
those properties are actively bot-defended. StreamCo reproduces the *shape* of that
problem — a balance due, a due date, a payment form, and **no machine-readable checkout** —
so the agent must fall back to reading the page.

This is a limitation of the destination, not of the agent, and it is the contrast the
whole argument rests on: **the better the destination's protocol, the less the agent has
to guess.** Any writeup that implies real-biller coverage is lying.

### Issued gift cards

The closed-loop cards are issued by our own storefront against our own ledger. That is
*why* they are redeemable there — a real closed-loop card works the same way, but nobody
should read this as integration with an external gift-card processor.

## What is simplified, and why

Deliberate, disclosed deviations from the specs. Each uses the standard's own names and
field semantics, so the implementation is **simpler than the spec but never wrong about
it**.

| Area | Spec says | We do | Why |
|---|---|---|---|
| Gift-card tokenization | ACP's seller-backed handlers tokenize via a `delegate_payment` endpoint | The code and PIN are presented directly on the instrument | `delegate_payment` is not yet implemented, so the agent does briefly hold the raw card credential — the one place this project currently falls short of "the agent never holds a raw credential". Recorded rather than glossed. |
| Card credential | Stripe's handler is designed around a scoped **Shared Payment Token**, granted per payment | A `pm_…` PaymentMethod id on `credential.token` | Same class of gap as the row above: the merchant charges a stored payment method rather than redeeming a token scoped to this destination and amount. It works, and it is genuinely Stripe — but the *scoping* is what Shared Payment Tokens exist for, so nothing here should be read as demonstrating them. |
| Mandate format | `PaymentMandate` is an SD-JWT-VC | Plain JWS, correct field semantics | SD-JWT-VC is a large dependency for a demo whose point is the funding and consent *flow*. Full VC is a stretch goal. |
| User identity | A verified session establishes `user_id` | Fixture `user_id` until Supabase lands | Storage starts on SQLite; without real auth, "the agent acts for *this* user" is asserted, not proven. Stated rather than papered over. |
| Agent request signing | Visa TAP profiles RFC 9421 signatures | Not implemented initially | Stretch goal. Until it exists, destinations do not authenticate the agent — do not claim they do. |

## What is real

- **Stripe test mode** is a genuine Stripe integration, not a mock — real API calls, real
  objects, real error codes.
- **The live decline** (one path, guarded) is a genuine `insufficient_funds` from the Visa
  network against a physical prepaid card. It is the one claim in this project that cannot
  be simulation.
- **The UCP conformance suite**, once passing, is the standards body's own test of our
  storefront — not a test we wrote to grade ourselves.

## Security posture

These are invariants, and each has a test in `PLAN.md`'s verification list.

- **The agent never holds a raw credential.** It holds scoped, revocable tokens. This is
  what UCP, ACP and AP2 independently specify.
- **No PAN ever reaches our server.** Open-loop cards are captured via Stripe Elements
  (browser→Stripe); we store only a `pm_…`. Storing a PAN — even encrypted — would move
  the project from PCI SAQ-A to SAQ-D: key management, rotation, access logging, quarterly
  ASV scans, annual pen test. Enormous cost, zero demo value.
- **Closed-loop credentials are hashed, never encrypted.** The merchant only ever
  *verifies* a presented code; it never needs to re-present it, so one-way is correct. If
  the agent could recover the number it would be a card vault, and building one badly is
  worse than not building one.
- **Live keys are read only from `STRIPE_LIVE_SECRET_KEY`**, never a swapped test key, and
  the live path refuses to run unless the charge *exceeds* the enrolled balance.
- **The deployed demo is test-mode only** — the build fails at startup if a live key is
  present. Mechanical, not a matter of discipline.

The last two are now enforced in code rather than described. `assertSafeStripeConfig` runs
before the server binds a port and refuses four configurations: a live key in
`STRIPE_SECRET_KEY`, a live key present under `NODE_ENV=production` or any of five platform
markers (`VERCEL`, `RENDER`, `FLY_APP_NAME`, `RAILWAY_ENVIRONMENT`, `K_SERVICE`, `DYNO`), and
a test key parked in the live variable — which would silently disarm every guard that keys
off its presence. The live client is a separate function that checkout cannot reach.

These tests were written *before* a live key ever touched the machine, because the failure
they prevent cannot be undone by noticing it afterwards.

### Known gaps

Recorded so they are never mistaken for oversights:

- No real authentication until the Supabase migration; multi-tenant isolation is
  therefore untested.
- Destinations do not verify agent identity until RFC 9421 signing lands.
- Enrolled prepaid balance is **a hint, not a fact** — no API can query an open-loop
  prepaid balance. The planner must handle a decline gracefully regardless of what the
  user recorded.

## Sources

Every claim above traces to one of these. Retrieved and measured **2026-07-30**; anything
added later carries its own date.

| Topic | Source |
|---|---|
| UCP spec & core concepts | `https://ucp.dev/documentation/core-concepts/` |
| UCP ↔ AP2 layering (mandate names, SD-JWT-VC) | `https://ucp.dev/documentation/ucp-and-ap2/` |
| UCP reference merchant (TypeScript) | `github.com/Universal-Commerce-Protocol/samples` → `rest/nodejs` |
| UCP JS SDK | npm `@ucp-js/sdk` v0.4.4, Apache-2.0, published 2026-07-30 |
| UCP conformance tests | `github.com/Universal-Commerce-Protocol/conformance` |
| AP2 specification | `https://ap2-protocol.org/ap2/specification/` |
| AP2 payment mandate | `https://ap2-protocol.org/ap2/payment_mandate/` |
| ACP seller-backed handler RFC | `github.com/agentic-commerce-protocol/agentic-commerce-protocol` → `rfcs/rfc.seller_backed_payment_handler.md` |
| Stripe UCP payments handler | `https://docs.stripe.com/agentic-commerce/ucp/stripe-payments-handler` |
| Stripe Shared Payment Tokens | `https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens` |
| Stripe Payment Element | `https://docs.stripe.com/payments/payment-element` |
| Stripe test cards | `https://docs.stripe.com/testing` |
| Visa TAP (reference only, not a dependency) | `https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications` |
| RFC 9421 — HTTP Message Signatures | IETF |

**Measured, not recalled:** `samples/rest/nodejs` passes **28/28 tests, 0
vulnerabilities** on the development machine (2026-07-30). That result is why this project
adapts the official sample rather than starting from scratch.

**Unreachable:** `developer.mastercard.com` serves a JavaScript shell on every path and is
unreadable even through a rendering fetcher; their GitHub organization publishes no Agent
Pay repository. Nothing in this project depends on Mastercard.

### On citing Visa TAP

`visa/trusted-agent-protocol` is cited but **not vendored**. Its `LICENSE.md` binds use to
the Visa Developer Center Terms of Use — it is not open source — it was last pushed
2025-10-28, and its `tap-agent/` is a Python Streamlit test harness rather than a library.
Where signing is implemented, the normative source is RFC 9421 itself.
