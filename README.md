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

## Status

**M1 done — a gift card pays for something, and the card covers the rest.**

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

Next: **M2**, a second destination, so the same planner pays a Stripe payment link as well
as the storefront.

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
