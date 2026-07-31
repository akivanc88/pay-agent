# pay-agent

POC agent that can use gift cards to make payments on behalf of a user.

A user loads gift cards into a wallet. An agent then goes to somewhere that wants money,
works out what is owed, decides how to pay from that funding, gets human approval when it
should, pays, and handles failure sensibly.

The interesting part is **"somewhere."** A spec-native storefront, a hosted payment link,
and a subscription biller with no API are all destinations. The architecture is therefore
**one funding-and-consent core, many destination adapters** — and the argument that falls
out of it is that *the better the destination's protocol, the less the agent has to guess.*

## Status

**Design phase — no application code yet.** The repository currently contains the plan and
the design record. See [`docs/DESIGN.md`](docs/DESIGN.md) for exactly what is built, what
is simulated, and what is simplified; it is kept honest as milestones land rather than
written at the end.

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
