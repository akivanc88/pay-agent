/**
 * The funding core's storage layer.
 *
 * Consumers import from here and never reach for a database driver directly — see
 * `repository.ts` for why that boundary is load-bearing.
 */

export * from "./money.js";
export * from "./types.js";
export * from "./repository.js";
export * from "./consent-types.js";
export * from "./consent-repository.js";
export { normaliseCode, last4 } from "./credentials.js";
export { openSqliteStore, LedgerError } from "./sqlite/store.js";
export { openConsentStore, ConsentError } from "./sqlite/consent-store.js";
