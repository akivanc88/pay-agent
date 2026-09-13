# pay-agent brand identity

Working style guide for anything public-facing outside the app itself: the landing page, the
Shopify App Store listing, chat-bot approval cards, and outreach decks. The web console's own UI
polish is governed separately by `apps/web/DESIGN-CONTRACT.md` and `docs/AAA-VISUAL-BRIEF.md` —
this file is the brand layer *around* the product, not the product's own interaction design, and
defers to those two wherever they overlap.

## Concept

pay-agent's whole pitch is that it **signs, gates, and writes down** what an agent is allowed to
spend — the vocabulary of an audit ledger, not a checkout widget. The identity leans into that: a
seal/stamp mark standing in for "signed and gated," a warm-paper-and-ink palette that reads as a
passbook rather than a SaaS dashboard, and tabular monospace figures wherever an amount or an id
appears. Avoid generic AI-product visual tropes (gradient hero, glowing orb, purple-to-blue) —
they undercut the "this is an audited financial primitive" claim the product is making.

## Logo

A seal mark: a checkmark inside a circular double ring, styled like a rubber-stamp approval —
"signed and gated," not "AI-generated."

- `docs/assets/logo-mark.svg` — light-surface variant, brand green (`#1e5b3a`)
- `docs/assets/logo-mark-dark.svg` — dark-surface variant, brand mint (`#6fc498`)

Usage: pair with the wordmark "pay-agent" set in IBM Plex Serif, semibold, lowercase, no tagline
baked into the lockup — taglines belong in surrounding copy, not the mark itself. Keep clear space
around the mark equal to at least the ring's own radius. Don't recolor the mark to anything outside
the two variants above; don't place it on a busy photograph or gradient.

## Color

Reuses the existing web-console tokens (`apps/web/app/globals.css`) rather than inventing a
parallel palette — the brand and the product should look like the same company.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#fbfaf7` | `#14130f` | page background |
| `paper-2` | `#f3f0e8` | `#1c1b17` | card/panel background |
| `ink` | `#1b1a17` | `#ede8df` | primary text |
| `ink-2` | `#55504a` | `#b8b1a4` | secondary text |
| `ink-3` | `#8a8377` | `#837c70` | tertiary text, labels |
| `rule` | `#ddd6c8` | `#322f28` | hairlines, dividers |
| `brand` / `brand-ink` | `#1e5b3a` | `#6fc498` | the one accent — approvals, links, primary actions |
| `brand-tint` | `#eaf2ec` | `#17241c` | brand-tinted backgrounds (chips, tags) |
| `stamp` | `#a23b2e` | `#d9776a` | **semantic only** — paused/needs-approval states, never decorative |

Rule: one brand accent (green) for "signed / settled / go," one semantic accent (stamp red) for
"paused / needs a human," and nothing else non-neutral. This mirrors `AAA-VISUAL-BRIEF.md`'s color
rule for the app itself — the brand layer should feel like the same restraint, not a louder cousin
of it.

## Type

| Role | Face | Notes |
|---|---|---|
| Display / headings | IBM Plex Serif | 500–700 weight; gives the ledger/officialdom feel without going full slab-serif |
| Body | IBM Plex Sans | 400/500; sets alongside the serif without a jarring family switch |
| Data — amounts, mandate ids, code, timestamps | IBM Plex Mono | always `font-variant-numeric: tabular-nums` so figures line up in columns |

Loaded via Google Fonts (`fonts.googleapis.com/css2?family=IBM+Plex+Serif:...&family=IBM+Plex+Sans:...&family=IBM+Plex+Mono:...`).
Avoid Inter/Space Grotesk — deliberately picked Plex to not read as the generic AI-product default.

## Reference implementation

The landing-page draft (private artifact, shared with the maintainer for review — not yet public)
implements this system end to end: masthead, hero with a stamped `IntentMandate` card, a
Draft → Gate → Settle ledger, a standards-grounding table (UCP/AP2/ACP/Stripe), and a terminal-style
demo transcript. Use it as the reference when building the Shopify listing assets and chat-bot
approval card templates so all three surfaces read as one brand.

## Voice

Specific, not hypey. Say what happened in concrete numbers ("SETTLED $45.99 — $20 gift card +
$25.99 card"), not adjectives ("seamless," "powerful"). When describing what pay-agent doesn't do,
say so plainly (see the README's "A note on scope") — the credibility argument depends on it.
