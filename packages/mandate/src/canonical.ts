/**
 * Canonical JSON and content hashing.
 *
 * A `CheckoutMandate` attests to a *hash of the checkout state*, and a hash is only useful if
 * the same state always hashes to the same bytes. `canonicalize` fixes object-key order (JSON
 * says nothing about it) and rejects the values — `undefined`, functions, `NaN` — whose encoding
 * is ambiguous, so two agents that agree on the facts agree on the digest. This is deliberately
 * small and dependency-free; it is not RFC 8785 JCS, and it does not need to be — both ends of
 * this project use it, and it is used to detect tampering, not to interoperate with a third party.
 */
import { createHash } from "node:crypto";

import { base64url } from "./jws.js";

/** A JSON value with a single, stable byte encoding. */
export type Canonicalizable =
  | string
  | number
  | boolean
  | null
  | Canonicalizable[]
  | { [key: string]: Canonicalizable };

/** Serialize with recursively sorted keys, refusing values that cannot encode deterministically. */
export function canonicalize(value: Canonicalizable): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`cannot canonicalize a non-finite number (${value})`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const members = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key] as Canonicalizable)}`);
  return `{${members.join(",")}}`;
}

/** SHA-256 of the canonical form, base64url — the value a `CheckoutMandate` commits to. */
export function contentHash(value: Canonicalizable): string {
  return base64url(createHash("sha256").update(canonicalize(value), "utf8").digest());
}
