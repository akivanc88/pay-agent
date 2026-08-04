# The critic's rubric

The standard is **not** "does it look nice." It is:

> Put this screenshot beside a screenshot of the real thing — Stripe Checkout, Shopify
> checkout, Apple's payment sheet, a premium DTC storefront. Which one is the real product?
> If you can tell instantly, and ours is the one that looks like a demo, it fails.

The critic's job is to find the specific reason it looks like a demo and name it. "Make it
better" is not a finding; "the price and the title are on the same baseline but optically
misaligned because one is a serif and one is a sans" is.

## Automatic failures

Any one of these fails the surface outright, regardless of how good it otherwise looks.

| # | Failure |
|---|---|
| 1 | **Unverifiable money shown as verified.** An open-loop prepaid balance without an `unverified`/`stale` badge. This is a project-thesis violation, not a style note. |
| 2 | **Misaligned money.** Amounts not in tabular figures, or a column of amounts that doesn't align on the decimal. |
| 3 | **An undesigned state.** A bare spinner, a raw error string, an empty area with nothing but text, an unhandled 404/500. |
| 4 | **A broken theme.** Anything illegible, invisible, or obviously unconsidered in either light or dark. |
| 5 | **Layout failure at 390px.** Horizontal scroll, clipped content, overlapping text, tap targets under 44px. |
| 6 | **Off-token color.** A hex value, radius, or shadow that isn't from `globals.css`. |
| 7 | **Motion that ignores `prefers-reduced-motion`,** or reduced-motion that breaks the layout or hides information. |
| 8 | **No visible focus state** on an interactive control. |

## What separates AAA from "fine"

This is where most surfaces actually lose. Look for these specifically:

- **Optical alignment, not just mathematical.** Icons optically centered in their buttons;
  text baselines aligned across differing type sizes; the visual left edge of a serif
  heading lining up with the sans body beneath it.
- **Deliberate density.** Real payment UIs are *tighter* than default Tailwind-ish spacing.
  Vertical rhythm should feel composed, not "gap-4 everywhere."
- **Type hierarchy doing real work.** Size, weight, color and family should make the
  scanning order obvious without the user thinking. If everything is 15px and grey, it fails.
- **The most important number is the most prominent thing.** On a payment screen, the
  amount due wins. On a wallet, the balance wins.
- **Borders and shadows earn their place.** A card with a border *and* a shadow *and* a
  background shift is usually two too many. Depth should be one idea, applied consistently.
- **Copy is specific and calm.** "Something went wrong" fails. "Your card was declined —
  insufficient funds. Your gift-card balance was restored in full." passes.
- **Empty states sell the product.** They explain what would be here and how to get it.
- **Hover/active/disabled states exist and feel physical.** Not opacity-only.
- **Nothing is default.** Default browser focus rings, default select arrows, default
  scrollbar-adjacent layout shift — all tells that this is a demo.

## Honesty review (specific to this project)

The project's entire argument is that it doesn't overclaim. The UI carries that:

- Simulated things are labelled as simulated.
- No invented amounts. If a number isn't known, the UI says it isn't known.
- Failure messaging states exactly what happened to the user's money. After a decline,
  it must say balances were restored.
- Nothing implies a real-world integration that isn't real.

## Verdict format

For each surface, the critic returns:

- **VERDICT: PASS** or **VERDICT: FAIL**
- **Blind comparison:** which looks more like a real product, ours or the reference, and why.
- **Findings**, each with: the file, what's wrong specifically, and what to change.
  Ranked worst first.

A PASS requires zero automatic failures **and** a blind comparison the surface plausibly
wins. Be harsh. A surface that is merely competent is a FAIL — say so and list what would
make it exceptional.
