# The AAA pass — working brief

Shared context for every builder and critic agent working this pass. Read
`DESIGN-CONTRACT.md` and `CRITIC-RUBRIC.md` first; this file is the operational layer on
top of them.

## The bar

Put the surface beside the real thing — Stripe Checkout, Shopify checkout, Apple's payment
sheet, a premium DTC florist (Bouqs, Farmgirl, Flowerbx). A stranger shown both should have
to think about which is the real product. If ours is instantly the demo, it fails.

## Environment

Both servers are already running. Do not start or restart them.

- store  → http://localhost:3000
- web    → http://localhost:3001 (`next dev`, hot-reloads existing files)

A funded gift card for driving checkout: **`GC-AAA-0001`**, PIN **`1234`**, $20.00.
Issue more with:

    pnpm --filter @pay-agent/store issue-card <CODE> 1234 <DOLLARS>

Gift cards are single-use in practice — a drained card reads $0.00 and the UI honestly
says so. Issue a fresh code rather than wondering why the split is empty.

## Harnesses

Run from `apps/web`:

    node scripts/shoot.mjs <outDir> [--only=<name>]   # screenshots, both themes+viewports
    node scripts/layout-audit.mjs                      # 390px: no h-scroll, no <44px targets
    node scripts/card-contrast.mjs                     # gift-card foil wordmark legibility
    GIFT_CODE=GC-AAA-0001 node scripts/pay-e2e.mjs     # full split payment, end to end
    pnpm --filter @pay-agent/web typecheck

Surface names for `--only`: `home`, `product`, `wallet`, `cart-empty`, `cart`,
`checkout-empty`, `checkout`, `not-found`.

**Look at your own work.** Screenshot it and Read the PNG. A change you have not looked at
is not done. Check light *and* dark.

## Rules of engagement

1. **Do not edit `app/globals.css`.** It is shared across every parallel workstream and
   concurrent edits lose each other. If you need a new token, put it in your report and it
   will be added centrally. Everything you need almost certainly already exists.
2. **Stay inside the files you own.** Your task names them. If a fix requires a file you do
   not own, report it rather than reaching across.
3. **Tokens only** — no raw hex, radius or shadow. The contract is binding.
4. **Money only through `<Money>` / `lib/money.ts`.** Integer minor units end to end.
5. **`typecheck` must stay clean** and `layout-audit.mjs` must stay green. Both are gates.
6. **Honesty outranks beauty.** Never invent a number, never style an unverifiable balance
   as verified, never imply an integration that isn't real. A prettier lie fails outright.
7. **`prefers-reduced-motion`** must be honored, and must not break layout or hide content.

## Where the craft actually is

The surfaces are already competent. Competent is a FAIL. What separates this from a real
product, in rough order of leverage:

- **Material.** Flat vector fills read as clipart. Real product imagery has depth, grain,
  soft occlusion, a light direction. Everything should look lit by the same lamp.
- **Density.** Real payment UIs are tighter than default spacing. Large dead areas — a
  short right rail beside a long left column, a gap before the footer — read as unfinished.
- **Optical alignment.** Not mathematical. Baselines across mixed families, icons optically
  centered, a serif heading's visual left edge against the sans beneath it.
- **Physics.** Hover/active should feel like a body moving, with weight and easing, not an
  opacity fade. Nothing linear. Nothing that snaps.
- **Focus and state.** Every interactive control needs a designed focus ring, hover, active
  and disabled. Default browser anything is a tell.

## The reference set — for real blind comparison

A critic working from memory of what Stripe Checkout looks like is doing a vibe check, not
a comparison. So the real surfaces are captured to a scratch directory of your choosing and
read off disk. Generate them, then read the PNGs with the Read tool and put them beside ours:

    node scripts/reference-shots.mjs <outDir>

    <outDir>/
      ref-stripe-checkout.png    real hosted Stripe Checkout (inside Stripe's demo frame)
      ref-bouqs-home.png         Bouqs storefront
      ref-farmgirl-home.png      Farmgirl Flowers storefront
      ref-flowerbx-home.png      Flowerbx storefront

Keep `<outDir>` outside the repo — these are third-party marketing pages, not ours to commit.

Note what these real surfaces actually do: photography with real depth and a consistent
light, tight type hierarchy, restrained palettes, and — on Stripe — a payment panel that is
denser and quieter than almost any imitation of it. Ours has better typography than most.
Ours loses on material.

## Reporting

Builders: report what changed, what you verified (with the harness output), what you could
not fix and why, and any token you need centrally added.

Critics: follow the verdict format in `CRITIC-RUBRIC.md`. Be specific and be harsh — "make
it better" is not a finding. A surface that is merely competent is a FAIL, and you should
say so plainly.
