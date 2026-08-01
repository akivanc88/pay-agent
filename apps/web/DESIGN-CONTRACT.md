# apps/web — design contract

**Every surface in this app obeys this file.** It exists so that surfaces built in parallel
read as one product rather than four. If you are building a surface here, this is binding.

## The bar

Best-in-class *restrained*. The reference points are Stripe Checkout, Shopify's checkout,
and Apple's payment sheets — fast, crisp, quiet, obviously trustworthy. **Not** a WebGL
showpiece. A payment surface earns trust by being calm and legible.

The test a surface has to pass: put a screenshot of it beside a screenshot of real Stripe
or Shopify checkout, ask someone which is the real product, and they should have to think
about it.

## Non-negotiables

1. **Use the tokens.** All color, radius, shadow, spacing, type and motion come from
   `app/globals.css`. Do not introduce a new hex value, a new radius, or a new shadow. If
   you genuinely need one, it belongs in `globals.css` as a token, not inline.
2. **Use the primitives.** `components/ui.tsx` gives you `Money`, `Panel`, `Button`,
   `Badge`, `SectionLabel`, `Container`. Extend them; don't fork them.
3. **Money only through `<Money minor={…} />`** (or `lib/money.ts`). Amounts are **integer
   minor units** end to end — never floats, never `toFixed` arithmetic. Always tabular
   figures.
4. **Both themes.** Light and dark must each look deliberate. Check both before you claim
   done. The theme is driven by `prefers-color-scheme` *and* `:root[data-theme]` — the
   toggle must win in both directions.
5. **`prefers-reduced-motion` is honored.** Motion is decoration here and never
   load-bearing. Reduced motion must not break a layout or hide information.
6. **Accessibility is not optional.** Real focus states (the global ring), labelled
   controls, `aria-live` for anything that updates asynchronously, semantic headings, and
   4.5:1 contrast on body text.
7. **Responsive.** 390px and 1440px both have to look intentional. Nothing scrolls
   horizontally; wide content (tables, code) scrolls inside its own container.
8. **Every state is designed.** Loading, empty, error, and success are part of the surface,
   not an afterthought. A spinner alone is not a loading state.

## Honesty rules — these come from the project, not from taste

This project's whole thesis is not overclaiming. The UI carries that:

- **An unverified balance is always marked.** Open-loop prepaid balances cannot be queried
  by any API — they are what the user typed. Render them with the `unverified` (or `stale`)
  badge, every time. Never style an unverifiable number as though it were confirmed.
- **Never invent an amount.** If a number isn't known, say it isn't known.
- **Simulated things are labelled.** If a surface shows something that isn't a real
  integration, it says so.

## What already exists — build on it, don't rebuild it

| Thing | Where |
|---|---|
| Design tokens, reset, motion, focus | `app/globals.css` |
| `Money`, `Panel`, `Button`, `Badge`, `SectionLabel`, `Container` | `components/ui.tsx` |
| Header / nav / theme toggle | `components/site-header.tsx`, `nav-links.tsx`, `theme-toggle.tsx` |
| Botanical product art (6 bespoke SVGs) | `components/product-art.tsx` |
| Product card | `components/product-card.tsx` |
| Store-not-running state | `components/store-down.tsx` |
| Typed store client (server-side) | `lib/store.ts` |
| Money formatting | `lib/money.ts` |
| **Cart state (shared — do not fork)** | `lib/cart.ts` — `useCart()` |
| Screenshot harness | `scripts/shoot.mjs` |

## The backend you are talking to

`apps/store` — a Hono UCP merchant on **:3000**. The web app proxies browser calls through
`/api/store/*` (see `next.config.mjs`); server components use `lib/store.ts` directly.

| Endpoint | Purpose |
|---|---|
| `GET /products` | Catalogue: `{currency, products[{id,title,price,currency,image_url,in_stock,stock}]}`. Price is **cents**. |
| `GET /.well-known/ucp` | UCP discovery — payment handlers, capabilities |
| `POST /checkout-sessions` | Create checkout. Body includes `line_items[{item:{id},quantity}]` |
| `PUT /checkout-sessions/:id` | Update (buyer, fulfillment, discounts, line items) |
| `POST /checkout-sessions/:id/complete` | Pay. Body: `{payment:{instruments:[…]}}` |
| `POST /checkout-sessions/:id/cancel` | Cancel |
| `GET /orders/:id` | Order |
| `GET /funding/cards` | Enrolled cards (both families) |
| `POST /funding/setup-intents` | Stripe SetupIntent for enrollment |
| `POST /funding/cards` | Record an enrollment |

**Currency is CAD throughout.** Do not hardcode `$` — use `Money`.

### The payment shape that matters

A payment is an **`instruments[]` array**, and the split is the whole point of the project:
gift cards are drawn first (open-amount, no `amount` field), and whatever they cannot cover
is authorized on the card rail. A zero-balance gift card contributing **$0 is valid, not an
error**.

```jsonc
{ "payment": { "instruments": [
  { "type": "gift_card", "handler_id": "seller_gift_card",
    "credential": { "type": "gift_card", "code": "GC-DEMO-0001", "pin": "1234" } },
  { "type": "card", "handler_id": "stripe_payments",
    "credential": { "type": "card", "token": "pm_…" } }
] } }
```

## Verifying your work

Both servers must be running:

```
pnpm --filter @pay-agent/store dev     # :3000
pnpm --filter @pay-agent/web dev       # :3001
```

Then, from `apps/web`:

```
node scripts/shoot.mjs /tmp/pay-agent-shots --only=/your/path
```

**Look at the screenshots.** Do not report a surface as finished without having viewed it
at desktop and mobile, in light and dark. `tsc --noEmit` passing is not "done" — it is the
floor.
