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

*Revised 2026-08-23 — the first version of this table went to press before M4.5 landed
(2026-08-07) and was left claiming a gap that had since closed. Corrected rather than quietly
edited, because a findings piece that overstates its own remaining gaps is a smaller version
of the same honesty failure as understating them.*

| Documented industry problem | This project's answer | Status |
|---|---|---|
| Checkout-as-a-button, no visible consent or spend control (the shape of what Instant Checkout shipped) | Signed `IntentMandate` (spend cap + destination allowlist), a policy gate that halts *before* any draw, and an approval inbox a human decides in | **Built** — `apps/agent/src/orchestrator.ts`, `apps/web/app/(console)` |
| No audit trail for what an agent actually did | Append-only `run_events`, trigger-enforced, every mandate persisted | **Built** — `packages/db` |
| Approve once, expect it to be remembered for that recurring payment | An opt-in "approve, and trust this destination going forward" choice that reissues the IntentMandate (new `jti`, widened cap/allowlist, fresh expiry) — never automatic, never available to the model | **Built — M4.5** (`docs/PLAN.md`, 2026-08-07) |
| Spend-cap-as-budget (a ceiling on total exposure, not just one charge) | An opt-in cumulative cap on the IntentMandate, summed across settled runs under its `jti`, checked in addition to the per-transaction cap | **Built — M4.5** (`docs/PLAN.md`, 2026-08-07) |
| Destinations can't tell a legitimate agent from bot traffic (the industry's top-cited fraud concern) | RFC 9421 agent request signing | **Not built** — always was a stated stretch goal (`PLAN.md`), now cross-referenced against why it matters |
| The credential a real merchant would need (Stripe's issued Shared Payment Token) | A hand-rolled EdDSA-JWS token with the same binds | **Simplified** — Stripe's issued token isn't enabled on this test account; this project mints the equivalent and says so |

The middle two rows were the honest finding at the time this was first written: the parts of
"an agent that pays on your behalf" a user would notice missing first — don't make me
re-approve the same bill, don't let a single high cap turn into unlimited autonomous spend —
were not yet built, even though the harder cryptographic machinery (signed mandates,
tamper-evident tokens, an append-only trail) already was. That gap is closed. What's left is
closer to what a user-facing pitch would deprioritize, not what it would lead with: a
destination's ability to *mechanically* tell this agent apart from bot traffic (unbuilt), and
real authentication in place of a fixture user (unbuilt). Both are genuinely harder than the
gate/budget work, and both are exactly the kind of thing that's easy to leave for "later" —
worth naming rather than letting the finished parts imply the rest is nearly done too.

## What would be needed for this to be more than a demo

In order of how much they'd change the trust story, not effort to build.

1. ~~**Standing authorization.**~~ **Built — M4.5.** An approval decision now has an
   explicit, opt-in second choice that reissues the mandate it resolved, rather than only
   ever releasing the one run.
2. ~~**A cumulative cap**, tracked per IntentMandate.~~ **Built — M4.5.** "Up to $50" can now
   mean a budget across a mandate's lifetime, not a per-call ceiling repeatable without limit.
3. **RFC 9421 agent signing**, so a destination has a mechanical answer to "is this really
   the user's agent" — the gap the fraud data says matters most to merchants, and now the
   single least-addressed item in this list.
4. **Real user authentication**, so "the agent acts for *this* user" is enforced, not
   asserted against a fixture `demo-user`.

Neither of these was proposed as a product roadmap, and closing two of the four doesn't
change that. They're the answer to the question this document exists to ask: given what
actually happened when a version of this idea shipped in production, what does this
implementation still owe the story it's telling. Right now, the honest answer is narrower
than it was in July — and still not "nothing."

## Sources

Retrieved 2026-08-07. Also cited in `docs/DESIGN.md` → Sources and `docs/PLAN.md` → Context.

- OpenAI ends Instant Checkout: [CNBC](https://www.cnbc.com/2026/03/24/openai-revamps-shopping-experience-in-chatgpt-after-instant-checkout.html), [Modern Retail](https://www.modernretail.co/technology/what-went-wrong-with-chatgpts-instant-checkout/), [Forbes](https://www.forbes.com/sites/jasongoldberg/2026/03/10/why-openais-checkout-retreat-spells-trouble-for-its-commerce-strategy/)
- Stripe/OpenAI ACP + Instant Checkout launch: [Stripe newsroom](https://stripe.com/newsroom/news/stripe-openai-instant-checkout)
- UCP co-developed by Google and Shopify: [GeekSeller](https://www.geekseller.com/blog/google-and-shopify-introduce-universal-commerce-protocol-for-agentic-commerce/)
- UCP antitrust / price-parity criticism: [The Sling](https://www.thesling.org/the-harm-to-consumers-and-sellers-from-universal-commerce-protocol-in-googles-own-words/), [Digiday](https://digiday.com/marketing/wtf-is-googles-universal-commerce-protocol/)
- Bot-initiated fraud tied to agentic shopping: [Payments Dive](https://www.paymentsdive.com/news/bot-payments-lag-in-agentic-commerce-ai-shopping-retail/810815/)
- AP2 launch and partner reaction: [Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)
