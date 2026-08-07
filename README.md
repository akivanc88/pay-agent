# pay-agent

[![CI](https://github.com/akivanc88/pay-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/akivanc88/pay-agent/actions/workflows/ci.yml)

POC agent that can use gift cards to make payments on behalf of a user.

A user loads gift cards into a wallet. An agent then goes to somewhere that wants money,
works out what is owed, decides how to pay from that funding, gets human approval when it
should, pays, and handles failure sensibly.

The interesting part is **"somewhere."** A spec-native storefront, a hosted payment link,
and a subscription biller with no API are all destinations. The architecture is therefore
**one funding-and-consent core, many destination adapters** — and the argument that falls
out of it is that *the better the destination's protocol, the less the agent has to guess.*

**A word on "agent," because it's two things.** "The agent" is the *deterministic rails*: the
planner + adapters that discover an amount, check it against what you authorized, pay, and recover
from failure — **no LLM**. On top of them sits the *brain* people usually mean — a language model that
pays from a plain-language instruction — which works by **driving these rails as tools**, boxed by the
spend cap, the signed mandates and the approval gate so it can never move more than you allowed.
Building the rails before the brain is the whole safety argument. (`UCP` is the destination-side
protocol the rails speak to a compliant merchant; StreamCo is the no-protocol contrast.) See
[`docs/PLAN.md`](docs/PLAN.md) → *"The agent is two layers."*

## Status

**M4 done — the brain, and a console to watch it think.** You tell the agent what to pay in plain
words — *"Pay my StreamCo bill from my gift card, up to $50"* — and a language model drafts the signed
spend mandate, drives the rails, and narrates the result, pausing for your approval whenever a payment
would exceed what you authorized. It **never moves money itself**: it proposes the cap and calls
`start_run` / `resume_run` as tools, while the deterministic core signs, gates, settles and reverses.
The driver is **provider-agnostic** (OpenAI or Anthropic), with a **deterministic scripted stand-in**
so it runs with no key and no network — and every surface says plainly which produced a run. Watch it
at `/agent`; drive it from the terminal:

```
$ pnpm --filter @pay-agent/agent demo:instruct --stub "Pay my StreamCo bill from my gift card, up to $50"
  You:  Pay my StreamCo bill from my gift card, up to $50
  → draft_intent   Signed an IntentMandate: cap $50.00, allowlist [streamco]  ← the core signed it, not the model
  → start_run      SETTLED $45.99 — $20.00 gift card + $25.99 card
  Agent: Done — I paid your StreamCo bill of $45.99: $20.00 from your gift card + $25.99 on your card.
```

The same request "up to $20" **pauses** at the gate with nothing drawn and asks you to approve it in
the inbox. `--auto-approve` plays the human's part end to end.

**M3 done — a third destination, signed consent, and a human in the loop.** One planner
pays three destinations without branching on which: a UCP storefront, a Stripe payment link,
and **StreamCo** — a simulated subscription biller with *no* payment API, whose amount the agent
must read off the page and refuses to guess when it can't. Every run is gated by a signed
`IntentMandate` (spend cap + destination allowlist): over the cap or off the allowlist, it **halts
for your approval** before touching any money. It issues genuine EdDSA-JWS `CheckoutMandate` /
`PaymentMandate`, writes an **append-only audit trail**, and shows the whole thing in a fintech-grade
approval inbox and run timeline. Scoped payment tokens refuse replay, amount-tampering, expiry and
reuse.

```
$ pnpm --filter @pay-agent/agent demo:streamco
  discovered   StreamCo account acct_demo: CAD 45.99        ← scraped off the page, no API
  policy_passed  within the CAD 100.00 cap, streamco allowlisted
  gift_drawn   CAD 20.00     card_charged  CAD 25.99         ← split, real test-mode card
  confirmed    settled (account shows paid)
```

Earlier milestones, still true:

**M1 — a gift card pays for something, and the card covers the rest.**

The storefront is UCP's official TypeScript sample, adapted. It advertises
`dev.acp.seller_backed.gift_card` at `/.well-known/ucp` and settles the whole
`payment.instruments[]` array — the upstream reference reads only `instruments[0]`, so a
cart paid with a gift card *and* a card is expressible in the protocol but unhandled there.
Whatever the gift cards cannot cover is authorized against Stripe in test mode: real
PaymentIntents, real decline codes.

```
cart $35.00   gift card ••••8909 $25.00
HTTP 200  order ord_38f338ee…
Stripe pi_3Tz7fR…  $10.00 CAD  succeeded  captured=$10.00

same cart, declining card
HTTP 402  insufficient_funds
gift card $25.00 → $25.00        ← restored exactly, draw still in the trail
```

**M2 — one planner, two destinations, no branching.** The storefront and a Stripe payment link,
paid by the same planner that decides the gift-first/card-remainder split from `capabilities()`
alone — never from which destination it is.

The consent demos, none of which need a card:

```bash
pnpm --filter @pay-agent/agent failure-matrix   # 12 ways a payment can go wrong, each handled safely
pnpm --filter @pay-agent/agent token-binds       # a scoped token refusing replay / tamper / expiry / reuse
pnpm --filter @pay-agent/agent seed-consent       # realistic runs, then open http://localhost:3001/activity
```

Next: **M5**, the real Visa gift card and the one guarded live-decline path — the closing beat the
brain can drive as its finale. Then **M6**, publish.

See [`docs/DESIGN.md`](docs/DESIGN.md) for exactly what is built, what is simulated, and
what is simplified. It is kept honest as milestones land rather than written at the end —
including the places this project currently falls short of its own rules.

## Running it

Requires Node ≥ 22.9, pnpm, and a Stripe **test** key.

```bash
pnpm install
cp .env.example .env                          # then fill in STRIPE_SECRET_KEY / _PUBLISHABLE_KEY
pnpm --filter @pay-agent/db build

pnpm --filter @pay-agent/store seed            # catalogue
pnpm --filter @pay-agent/store issue-card GC-DEMO-0001 1234 25.00
pnpm --filter @pay-agent/store stripe-check    # real split checkout, both outcomes
pnpm --filter @pay-agent/store show-ledger     # balances and the audit trail

pnpm --filter @pay-agent/store dev             # http://localhost:3000/enroll
pnpm -r test                                   # 81 tests
```

`stripe-check` is the one to run first: it starts the storefront on a socket, completes a
real split checkout over HTTP, and then asks **Stripe** what happened rather than asking our
own code.

## Documents

| Document | What it is |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | The plan, the architecture, and the argument |
| [`docs/DESIGN.md`](docs/DESIGN.md) | What's implemented, which spec each piece comes from, what's faked |

## Grounding

Built on published standards rather than invention, and on the standards bodies' own
reference implementations rather than hand-rolled equivalents:

- **UCP** — [Universal Commerce Protocol](https://ucp.dev) — funding, split payments, and
  the storefront, adapted from UCP's official TypeScript sample
- **AP2** — [Agent Payments Protocol](https://ap2-protocol.org) — consent, via
  `CheckoutMandate` and `PaymentMandate`
- **ACP** — [Agentic Commerce Protocol](https://agenticcommerce.dev) — the
  `dev.acp.seller_backed.gift_card` handler pattern
- **Stripe** — payment rails, the `com.stripe.payments` UCP handler, and Shared Payment
  Tokens
- **RFC 9421** — HTTP Message Signatures, as profiled by Visa's Trusted Agent Protocol

Sources are cited with retrieval dates in both documents.

## A note on scope

Two things this project deliberately does **not** claim:

1. It cannot pay a real Netflix or Disney+ account. Those have no public payment API,
   automating a login violates their terms, and they are bot-defended. The biller
   destination is a faithful simulation of the *shape* of that problem, and is labelled as
   such throughout.
2. Almost everything runs in Stripe test mode. Exactly one path touches real money rails:
   a deliberately over-balance charge against a physical Visa gift card, which takes a
   genuine network decline. No money moves.
