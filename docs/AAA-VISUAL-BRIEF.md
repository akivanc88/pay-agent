# AAA-execution reference brief

Working brief for the 2026-08 visual-elevation pass across `apps/web`. Read this **alongside**
`apps/web/DESIGN-CONTRACT.md`, which is the binding authority — this file exists to make its
"best-in-class restrained" bar concrete with named references and checkable specifics, not to
add any rule the contract doesn't already carry. Where the two conflict, the contract wins.

Research retrieved 2026-08-13 (Stripe, Shopify, Apple HIG, and industry commentary on Linear /
Vercel — see Sources at the bottom). None of this is proprietary token data pulled from those
products' actual CSS; it is publicly stated design philosophy and well-established, verifiable
UI conventions. Treat numbers below as defensible starting points, not gospel — if `globals.css`
already encodes a coherent, deliberate system, tune within it rather than importing a new one.

## The one-line bar

*Restraint is the tell.* Every source agrees on this independently: Stripe's checkout is
"neutrals plus measured indigo," Linear is "cool grays plus brand indigo," Vercel is
"near-monochrome plus context color." Premium reads as **less** color, **less** motion, **less**
decoration than an amateur attempt — not more. If a change adds visual noise to *look* more
finished, it's moving the wrong direction. The bar this app is held to (per DESIGN-CONTRACT.md)
is exactly this family, not a WebGL showpiece.

## Concrete checklist, by category

### Spacing & layout
- An 8px (or 4px half-step) rhythm is the industry-standard grid; audit `globals.css` tokens
  against it and fix any spacing value that doesn't land on the grid, rather than inventing a
  new scale.
- Section separation (e.g. shipping vs. payment on a checkout) should read as **whitespace and
  a heading**, not a heavy divider/border. Stripe explicitly does this for address vs. payment.
- Tap targets ≥44px on any interactive control at mobile widths (Stripe's own stated minimum).

### Motion
- Entrances/state-changes: **150–250ms**, ease-out (`cubic-bezier(0.16, 1, 0.3, 1)` or similar —
  "decelerate" curves, not linear or bouncy). Exits can be faster (~100–150ms).
- Motion communicates state change (a total updating, an item added, a status flipping) — it is
  never decorative for its own sake. `prefers-reduced-motion` must degrade to an instant state
  change with no information lost (DESIGN-CONTRACT.md non-negotiable #5).
- A *button* alone can have this many distinct states — idle, hover, focus-visible, active/press,
  loading, disabled — each transitioning, not snapping. This is where "premium" is judged most
  directly per the research: "the microstates most teams treat as afterthoughts are where premium
  UI shows up."

### Loading / empty / error states (DESIGN-CONTRACT.md non-negotiable #8)
- Loading: skeletons shaped like the real content (matching line-heights / card geometry), not a
  centered spinner replacing the whole surface. A spinner alone is explicitly called out as *not*
  a loading state.
- Error microcopy is **action-oriented**, never a bare code: say what happened and what to do
  next, not "Error 402." (This app already has real reasons to surface — issuer decline codes,
  `insufficient_funds`, cap-exceeded — the copy should translate the code, not hide or repeat it.)
- Empty states explain *why* it's empty and what the next action is, not just "No items."

### Checkout-specific (Apple Pay HIG + Stripe/Shopify converge here)
- No interstitial screens between "buyer commits to pay" and the outcome. Collect anything
  optional (promo codes, gift notes) *before* that point, never as a pop-up mid-flow.
- Show only what's needed to complete and service the transaction — resist adding fields or
  confirmations "for clarity" that aren't load-bearing.
- Mobile-first viewport as the primary target, not an afterthought scaled down from desktop.

### Color
- Color carries meaning only: destructive/danger red, success green, one brand accent for the
  primary action. Not decoration. If a surface uses more than ~2 non-neutral colors outside of
  product imagery, that's a signal to cut, not to justify.

### Accessibility as part of "premium," not separate from it
- The research explicitly frames Lighthouse-accessibility-90+ as *part of* what makes Linear/
  Vercel read as premium, "enforced at the component level, not audited at the end." Treat
  DESIGN-CONTRACT.md non-negotiable #6 (focus states, labelled controls, `aria-live`, 4.5:1
  contrast) as part of the AAA bar itself, not a compliance checkbox alongside it.

## How to use this brief

1. **Implementers**: use this as a checklist while polishing your surface. Don't add anything
   this brief or DESIGN-CONTRACT.md doesn't call for — restraint is the point.
2. **Critics**: score against DESIGN-CONTRACT.md's own test first ("beside a screenshot of real
   Stripe/Shopify checkout, would someone have to think about which is real?"), then use this
   brief's checklist to name *specific, fixable* gaps rather than vague "make it nicer" feedback.
   A finding without a concrete fix (a spacing value, a missing state, a motion that's too slow/
   fast/absent) is not actionable — don't report it as one.

## Sources

Retrieved 2026-08-13, general design philosophy and stated conventions, not scraped
implementation detail:

- [Checkout UI design strategies for faster transactions — Stripe](https://stripe.com/resources/more/checkout-ui-strategies-for-faster-and-more-intuitive-transactions)
- [Mobile checkout UI: Best practices — Stripe](https://stripe.com/resources/more/mobile-checkout-ui)
- [Shopify Checkout UX Best Practices: 30 Design Principles for 2026 — Cartylabs](https://cartylabs.com/blog/shopify-checkout-ux-best-practices/)
- [Writing Microcopy: A 2026 Guide For Ecommerce UX — Ecommerce Fastlane](https://ecommercefastlane.com/writing-microcopy-a-2026-guide-for-ecommerce-ux-with-examples-shopify/)
- [Apple Pay — Human Interface Guidelines](https://developers.apple.com/design/human-interface-guidelines/technologies/apple-pay/introduction)
- [How Stripe, Linear, and Vercel Ship Premium UI — Mantlr](https://mantlr.com/blog/stripe-linear-vercel-premium-ui)
