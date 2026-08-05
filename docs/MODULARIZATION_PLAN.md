# Modularization and Codebase Documentation Plan

## Status and sequencing

This plan is intentionally deferred until the M2 destination work is complete and merged.
Do not begin the refactor on `feat/m2-destinations` while that work is still active.

Before implementation:

1. Finish testing and commit the outstanding M2 changes.
2. Merge the completed M2 branch through the normal project workflow.
3. Create a dedicated refactor branch from the merged result, such as
   `refactor/modular-architecture`.
4. Treat the merged M2 behavior and documentation as the refactor baseline.

This separation keeps unfinished feature work out of a broad structural change and lets a
future Claude Code session continue M2 without invalidated paths, symbols, or diffs.

## Objective

Refactor the major codebase hotspots into intent-based modules, consolidate genuinely
shared behavior in a browser-safe workspace package, document every handwritten code asset
with a concise purpose header, and add an exact 25-rule root `AGENTS.md`.

Preserve existing public interfaces and observable behavior except for defects demonstrated
by characterization tests. Organize by domain responsibility rather than enforcing an
arbitrary maximum file length.

## Implementation changes

### 1. Establish safety coverage

- Begin from the merged M2 state and preserve all M2 payment compensation, transport
  ambiguity, and documentation behavior.
- Add characterization tests for payment ordering, rollback, inventory release,
  idempotency response codes, nonfatal webhooks, payment error-code propagation,
  funding-plan semantics, and checkout UI transitions.
- Preserve exact error statuses and messages, UCP wire casing, optional-versus-null fields,
  instrument ordering, line identifiers, and merchant-authoritative totals.

### 2. Create `@pay-agent/protocol`

Add a dependency-free, browser-safe workspace package containing shared wire contracts and
pure protocol helpers. It should export:

- Narrow UCP checkout, catalog, funding-card, fulfillment, and payment-instrument DTOs.
- Gift-card and Stripe handler identifiers and instrument builders.
- Pure total, fulfillment, line-item-payload, gift-code-normalization, and known-balance
  split helpers.
- A configurable HTTP primitive that retains `status`, `detail`, and issuer `code`.

Keep environment-specific policy local to its application:

- Next.js caching and `/api/store` rewrite behavior.
- Agent-side ambiguity resolution and safe confirmation reads.
- Retry policy and indeterminate-payment handling.
- Database, crypto, and Stripe-secret access.
- The web UI's deliberate propagation of unknown balances.

Do not expose SQLite, Node crypto, merchant implementation details, or server-only code to
browser consumers. Keep the existing domain-specific money types, sharing only safe integer
validation and known-balance split primitives.

### 3. Split the store checkout service

Keep `CheckoutService` as the compatible Hono-facing facade and extract modules by intent:

- Idempotency hashing, replay/conflict checks, and result storage.
- Fulfillment destinations, groups, and shipping quotes.
- Authoritative product enrichment, pricing, discounts, and inventory pre-validation.
- UCP agent-profile parsing and webhook delivery.
- Inventory reservation, release, expectations, and order construction.
- Payment-attempt coordination, commit state, and idempotent rollback.

Preserve the exported class, bound route handlers, `shipOrder`, and temporary private
delegates accessed by existing tests.

The payment sequence must remain:

1. Draw gift-card funds.
2. Authorize the card rail for the actual remainder.
3. Reserve inventory and construct the order.
4. Capture the authorization.
5. Persist the order and checkout.
6. Deliver the nonfatal webhook.

Before capture, unexpected failure must release reserved inventory, cancel the card
authorization, and reverse gift-card draws. Rollback must be safe to invoke more than once.

### 4. Split the web and visual hotspots

- Divide the checkout session module into types, selectors, client transport, and funding
  modules. Retain `session.ts` as a compatibility barrel exporting every current symbol.
- Consolidate `completeSession` and `pay` behind one request implementation that preserves
  issuer error codes.
- Extract destination, delivery, payment, summary, and terminal-state checkout components.
  Keep route-level orchestration in the page initially, then extract a controller hook only
  after the behavior is characterized.
- Split product artwork into shared geometry/stage utilities and individual product
  illustrations. Preserve the `ProductArt` signature, import path, registry, deterministic
  SVG identifiers, accessible labels, and fallback.
- Split gift-card rendering into texture generation and Three.js scene-lifecycle modules.
  Preserve the `GiftCard3D` signature, lazy Three.js loading, static fallback, reduced-motion
  behavior, theme rebaking, and complete listener/observer/RAF/GPU cleanup.
- Split oversized CSS modules alongside the components or sections that own those styles.
  Do not split cohesive visual code solely to satisfy a line-count target.

### 5. Apply DRY without collapsing distinct policies

Consolidate:

- UCP checkout wire types and pure selectors.
- Funding and catalog response contracts used by producers and consumers.
- Payment handler constants and instrument shapes.
- Gift-code normalization.
- Known-balance gift-first/card-remainder arithmetic.
- Repeated store-test setup for checkout, destination, and shipping selection.

Keep separate:

- Web, agent, and server transport policies.
- Agent executable planning versus the web UI's unknown-balance display semantics.
- Non-negative ledger money types versus signed display values.
- Database credential hashing and browser-visible last-four matching policy.

### 6. Add file-level documentation

Add file-specific headers to every handwritten `.ts`, `.tsx`, `.mjs`, CSS, and static HTML
file. Each header should include only the applicable information:

1. Purpose and ownership.
2. Architectural boundary.
3. Load-bearing invariants.
4. Non-obvious side effects or failure behavior.
5. Upstream provenance where the code was adapted.

Headers should normally be two to six lines and no more than ten. Keep detailed rationale
beside the implementation it explains. Add symbol-level JSDoc only for exported contracts
and non-obvious security or protocol behavior.

Exclude generated output, dependencies, lockfiles, JSON configuration, Markdown, legal
files, environment templates, binary assets, and generated declarations. Do not add author
names, dates, change logs, line counts, stale milestone status, or identical boilerplate.

Add a lightweight repository check that validates eligible files begin with the appropriate
comment form. Run it from the root test command. Semantic header quality remains a review
responsibility.

### 7. Add root `AGENTS.md`

Create a canonical uppercase root `AGENTS.md` containing exactly 25 numbered rule/feature
lines. Cover:

1. pnpm, Node, strict TypeScript, ESM, and NodeNext requirements.
2. Standard typecheck, test, and build commands.
3. Intent-based modularity and reuse.
4. One funding-and-consent core with many destination adapters.
5. The `PaymentDestination` contract.
6. HTTP-only separation between the agent and merchant implementation.
7. Capability-based planner behavior and destination independence.
8. The discover-to-confirm payment flow.
9. Approval and policy checks before funding mutation.
10. Gift-first and card-remainder planning.
11. Open-amount gift-card semantics.
12. Ordered UCP `payment.instruments[]` settlement.
13. Integer minor-unit money arithmetic.
14. CAD and currency-mismatch handling.
15. Closed-loop versus open-loop funding distinctions.
16. The prohibition on PAN, CVV, or raw open-loop credentials reaching the server.
17. Server verification of Stripe SetupIntents.
18. Closed-loop code and PIN storage rules.
19. Append-only ledger behavior.
20. Atomic draws and exact compensating reversals.
21. The database access boundary.
22. Authorize-before-order and capture-after-durability sequencing.
23. Safe handling of indeterminate payments.
24. Stripe test-mode and live-key restrictions.
25. `docs/DESIGN.md` as implemented truth and the web design-contract requirement.

Also correct README's Node requirement from 20 to the manifest-authoritative 22.9 and update
only nearby prose made stale by the refactor.

## Public interfaces and compatibility

- Add the new `@pay-agent/protocol` workspace package.
- Preserve `CheckoutService`, all current route handlers, `PaymentDestination`, existing
  checkout-session exports, `ProductArt`, and `GiftCard3D`.
- Preserve current import paths through facade and barrel files during incremental moves.
- Keep the planner destination-independent.
- Preserve the distinction between executable unknown-balance planning and deliberately
  unknown UI projections.
- Never expose payment secrets or merchant persistence through shared browser-safe modules.

## Test plan

- Add protocol unit tests for DTO-compatible helpers, total selection, fulfillment
  completeness, code normalization, line-item payloads, instrument order and shape, and
  known-balance splitting.
- Extend store tests for create/update/complete/cancel idempotency, rollback ordering,
  unexpected inventory cleanup, capture failure, webhook failure after capture, discounts,
  fulfillment, and the complete payment lifecycle.
- Add agent adapter tests for network failure, non-JSON responses, status/code retention,
  409/5xx ambiguity, and safe read-only confirmation.
- Add web pure-helper tests for known, unknown, stale, ambiguous, and insufficient funding.
- Exercise checkout empty, loading, fatal, ready, declined, and paid states; optimistic
  selections; delivery repricing; payment disabling; cart preservation on decline; and cart
  clearing on success through the existing browser automation.
- Run typechecking, all workspace tests, header enforcement, builds, payment E2E, layout and
  contrast audits, and screenshot checks after each staged extraction.

## Assumptions

- M2 is completed and merged before this plan begins.
- Refactoring occurs on a dedicated branch created from that merged state.
- "Each file" means each handwritten code asset, not generated, machine-managed, prose,
  legal, or non-commentable files.
- Proven defects discovered during characterization may be fixed; unrelated behavior changes
  remain out of scope.
- `docs/DESIGN.md` remains authoritative when it disagrees with forward-looking plans.
- Existing work always belongs to its author and must be preserved during extraction.
