1. Use pnpm with Node.js 22.9 or newer; keep TypeScript strict, ESM-native, and Node packages on NodeNext module semantics.
2. Validate changes from the repository root with `pnpm typecheck`, `pnpm test`, and `pnpm build`, narrowing to workspace filters only while iterating.
3. Organize modules by intent and responsibility, reuse genuinely shared behavior, and preserve compatible facade or barrel imports during extraction.
4. Maintain one funding-and-consent core with many destination adapters; destination-specific behavior belongs behind adapters.
5. Preserve the `PaymentDestination` contract and its `discover`, `capabilities`, `pay`, and `confirm` lifecycle.
6. Keep the agent and merchant implementation separated by HTTP; the agent must not import merchant internals, persistence, or server-only code.
7. Make planner decisions from destination capabilities, never destination identity, adapter names, or destination-specific branching.
8. Follow the payment flow in order: discover the obligation, inspect capabilities, plan funding, obtain required consent, pay, then confirm safely.
9. Complete approval and policy checks before any gift-card draw, card authorization, or other funding mutation.
10. Plan gift cards first and authorize the card rail only for the actual remaining amount.
11. Submit gift cards with open-amount semantics so the redeemer draws up to the available balance; a zero contribution remains valid.
12. Settle the complete ordered UCP `payment.instruments[]` array without reordering or assuming only the first instrument exists.
13. Represent and calculate money as safe integers in minor units; never use floating-point arithmetic for settlement.
14. Use CAD for the implemented flows and reject currency mismatches rather than converting or drawing balances one-to-one across currencies.
15. Keep closed-loop gift-card funding distinct from open-loop card rails, including their credentials, balance knowledge, and reversal behavior.
16. Never let PANs, CVVs, or raw open-loop credentials reach this repository's servers; collect card details only in Stripe-hosted browser surfaces.
17. Verify Stripe SetupIntents server-side, require the repository's enrollment marker, and derive the PaymentMethod from Stripe rather than trusting client claims.
18. Store closed-loop codes only as keyed lookup digests and protect PINs with salted slow hashes; never persist plaintext credentials.
19. Keep the ledger append-only: balances are signed sums of entries, and corrections or refunds are new compensating entries rather than updates or deletes.
20. Make draws atomic and reverse each draw at most once with an exact compensating entry tied to the original operation.
21. Access funding data through `@pay-agent/db`; direct SQLite use is limited to its implementation and the allowlisted inherited merchant data layer in `apps/store/src/data`.
22. Authorize the card before order construction, capture only after inventory and order durability are certain, and unwind provisional legs on pre-capture failure.
23. Treat transport-ambiguous payment outcomes as indeterminate: do not retry mutations or reverse possibly settled funds; use safe read-only confirmation and reconciliation.
24. Keep Stripe integrations in test mode by default, reject live keys outside the single explicitly guarded live-decline path, and never broaden live-money access casually.
25. Treat `docs/DESIGN.md` as the authority for implemented truth and preserve `apps/web/DESIGN-CONTRACT.md` whenever changing web behavior or presentation.
