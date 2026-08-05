/** Hashes checkout requests and enforces replay-safe idempotency results and conflicts. */

import { createHash } from "crypto";

import {
  getIdempotencyRecord,
  saveIdempotencyRecord,
} from "../data";

export type IdempotencyReplay =
  | { kind: "miss"; requestHash: string }
  | { kind: "conflict" }
  | { kind: "replay"; body: unknown };

export function computeIdempotencyHash(data: unknown): string {
  const replacer = (_key: string, value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.keys(value as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((sorted, key) => {
            sorted[key] = (value as Record<string, unknown>)[key];
            return sorted;
          }, {})
      : value;

  return createHash("sha256")
    .update(JSON.stringify(data, replacer))
    .digest("hex");
}

export function findIdempotencyReplay(
  key: string,
  request: unknown,
): IdempotencyReplay {
  const requestHash = computeIdempotencyHash(request);
  const record = getIdempotencyRecord(key);
  if (!record) return { kind: "miss", requestHash };
  if (record.request_hash !== requestHash) return { kind: "conflict" };
  return { kind: "replay", body: JSON.parse(record.response_body) };
}

export function storeIdempotencyResult(
  key: string,
  requestHash: string,
  status: number,
  body: unknown,
): void {
  saveIdempotencyRecord(key, requestHash, status, JSON.stringify(body));
}
