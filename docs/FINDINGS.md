# Findings — the written piece

`docs/PLAN.md` records the plan; `docs/DESIGN.md` records what got built and what's
simulated. This document is the third thing the capstone is judged on: a **written findings
piece** for an employer/portfolio audience (`PLAN.md` → Scope decisions), not a business
case and not a pitch. Its job is to show the reasoning was checked against reality, not
just against the plan.

## Why this problem, why now

The architectural bet this project makes — one funding-and-consent core, many destination
adapters, no LLM in the rails, a signed IntentMandate gating everything the brain can do —
was made on 2026-07-30, before there was any public evidence either way. Since then, the
adjacent industry ran something close to the opposite bet, in production, and it's worth
stating plainly what happened rather than only what was planned.

**OpenAI shipped a single-destination, no-standing-consent version of "an agent pays for
you."** ACP-driven Instant Checkout launched inside ChatGPT on 2025-09-29, live with Etsy
and a dozen Shopify brands. It was pulled on 2026-03-24. The numbers: only about 12 of
Shopify's millions of merchants ever went live with it, and Walmart measured in-chat
checkout converting roughly 3x worse than a normal click-through to walmart.com — despite
ChatGPT sending higher-intent traffic than average. OpenAI's stated reason was that it "did
not offer the level of flexibility we aspire to provide."

**The wider landscape is contested, not settled.** UCP — the protocol this project's
storefront speaks — was announced 2026-01-11, co-developed by Google *and Shopify*, backed
by Etsy, Wayfair, Target and Walmart. It is not a niche proposal a merchant might adopt; two
of e-commerce's largest platforms already built it. At the same time, it has drawn real
criticism: price-parity terms that echo conduct already found anticompetitive against
Google in prior litigation, and concern that agent-mediated checkout moves the point of sale
away from a merchant's own storefront and into a surface the merchant doesn't control.
Separately, payments-industry data shows a 25–40% spike in malicious bot-initiated
transactions tied to agentic shopping, and 78% of surveyed financial institutions expect
fraud to rise specifically because of AI shopping agents — because agent purchase patterns
(rapid sequential orders, cross-category buying, unusual velocity) trip fraud models built
for humans.

Two things follow from this, and both shaped what's below rather than what got built (the
architecture predates this research): first, that the failure mode Instant Checkout hit —
low trust, low conversion, a bare checkout button with no visible consent model — is exactly
the gap this project's consent layer (signed mandates, a policy gate, an approval inbox, an
append-only audit trail) is aimed at, even though it wasn't built in response to it. Second,
that the fraud/bot-trust half of the story — can a destination tell this agent apart from
malicious traffic — is *not* addressed by this project yet (RFC 9421 signing is unbuilt),
which matters because it's the half the industry currently worries about most.

## What the architecture answers, and what it doesn't yet

| Documented industry problem | This project's answer | Status |
|---|---|---|
| Checkout-as-a-button, no visible consent or spend control (the shape of what Instant Checkout shipped) | Signed `IntentMandate` (spend cap + destination allowlist), a policy gate that halts *before* any draw, and an approval inbox a human decides in | **Built** — `apps/agent/src/orchestrator.ts`, `apps/web/app/(console)` |
| No audit trail for what an agent actually did | Append-only `run_events`, trigger-enforced, every mandate persisted | **Built** — `packages/db` |
| Approve once, expect it to be remembered for that recurring payment | — | **Not built, tracked as M4.5.** `resumeRun` resolves one run; it never widens the mandate that gated it. Recorded in `DESIGN.md` → Known gaps. |
| Spend-cap-as-budget (a ceiling on total exposure, not just one charge) | — | **Not built, tracked as M4.5.** The gate checks each amount independently; nothing tracks cumulative spend across runs. |
| Destinations can't tell a legitimate agent from bot traffic (the industry's top-cited fraud concern) | RFC 9421 agent request signing | **Not built** — always was a stated stretch goal (`PLAN.md`), now cross-referenced against why it matters |
| The credential a real merchant would need (Stripe's issued Shared Payment Token) | A hand-rolled EdDSA-JWS token with the same binds | **Simplified** — Stripe's issued token isn't enabled on this test account; this project mints the equivalent and says so |

The middle two rows are the honest finding: the parts of "an agent that pays on your behalf"
that a user would notice missing first — don't make me re-approve the same bill, don't let a
single high cap turn into unlimited autonomous spend — are the parts not yet built, even
though the harder cryptographic machinery (signed mandates, tamper-evident tokens, an
append-only trail) already is. That's backwards from what a user-facing pitch would want,
and worth stating rather than smoothing over.

## What would be needed for this to be more than a demo

In order of how much they'd change the trust story, not effort to build. The first two are
now **M4.5** in `docs/PLAN.md`, scheduled before the real-card milestone rather than left as
open-ended findings:

1. **Standing authorization.** An approval should be able to update the IntentMandate it
   resolved, not just release the one run — otherwise "gets human approval when it should"
   degrades to "asks every time it isn't sure," which is closer to what shipped inside
   ChatGPT than what this project's own pitch describes.
2. **A cumulative cap**, tracked per IntentMandate, so "up to $50" means a budget, not a
   per-call ceiling repeatable without limit within the mandate's expiry.
3. **RFC 9421 agent signing**, so a destination has a mechanical answer to "is this really
   the user's agent" — the gap the fraud data says matters most to merchants, and currently
   the least-addressed one here.
4. **Real user authentication**, so "the agent acts for *this* user" is enforced, not
   asserted against a fixture `demo-user`.

None of these are proposed as a product roadmap. They're the answer to the question this
document exists to ask: given what actually happened when a version of this idea shipped in
production, what does this implementation still owe the story it's telling.

## Sources

Retrieved 2026-08-07. Also cited in `docs/DESIGN.md` → Sources and `docs/PLAN.md` → Context.

- OpenAI ends Instant Checkout: [CNBC](https://www.cnbc.com/2026/03/24/openai-revamps-shopping-experience-in-chatgpt-after-instant-checkout.html), [Modern Retail](https://www.modernretail.co/technology/what-went-wrong-with-chatgpts-instant-checkout/), [Forbes](https://www.forbes.com/sites/jasongoldberg/2026/03/10/why-openais-checkout-retreat-spells-trouble-for-its-commerce-strategy/)
- Stripe/OpenAI ACP + Instant Checkout launch: [Stripe newsroom](https://stripe.com/newsroom/news/stripe-openai-instant-checkout)
- UCP co-developed by Google and Shopify: [GeekSeller](https://www.geekseller.com/blog/google-and-shopify-introduce-universal-commerce-protocol-for-agentic-commerce/)
- UCP antitrust / price-parity criticism: [The Sling](https://www.thesling.org/the-harm-to-consumers-and-sellers-from-universal-commerce-protocol-in-googles-own-words/), [Digiday](https://digiday.com/marketing/wtf-is-googles-universal-commerce-protocol/)
- Bot-initiated fraud tied to agentic shopping: [Payments Dive](https://www.paymentsdive.com/news/bot-payments-lag-in-agentic-commerce-ai-shopping-retail/810815/)
- AP2 launch and partner reaction: [Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)
