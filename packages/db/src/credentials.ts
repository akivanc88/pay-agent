/** Hashes and verifies closed-loop codes and PINs without storing recoverable credentials. */

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * Closed-loop card credentials.
 *
 * The code and the PIN play different roles, so they get different treatment:
 *
 * - The **code** identifies the card, like a username. We must be able to find a card
 *   from a presented code, so its hash has to be deterministic — an HMAC under a secret
 *   pepper. A per-card salt would be unusable here, since we would not know which salt
 *   to apply until after we had found the row.
 * - The **PIN** authenticates, like a password. It gets a per-card random salt and a
 *   deliberately slow KDF, so a leaked database does not yield PINs.
 *
 * Neither is reversible, which is the point: the merchant only ever *verifies* a
 * presented credential. It never needs to re-present one, so it never needs to recover
 * one. Anything reversible would be a card vault.
 */

const SCRYPT_KEYLEN = 64;

/**
 * Secret pepper for code lookup hashes.
 *
 * A pepper (unlike a salt) is not stored beside the data, so a database leak alone does
 * not permit offline enumeration of card codes. In production this must come from the
 * environment; the development fallback is deliberately obvious rather than
 * plausible-looking, so nobody mistakes it for a real secret.
 */
function pepper(): string {
  const fromEnv = process.env["GIFT_CARD_CODE_PEPPER"];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "GIFT_CARD_CODE_PEPPER must be set in production — refusing to hash card codes " +
        "with the development fallback.",
    );
  }
  return "DEVELOPMENT-ONLY-PEPPER-DO-NOT-USE-IN-PRODUCTION";
}

/** Normalise before hashing so formatting differences don't defeat lookup. */
export function normaliseCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/** Deterministic lookup hash for a card code. */
export function hashCode(code: string): string {
  return createHmac("sha256", pepper()).update(normaliseCode(code)).digest("hex");
}

export interface HashedPin {
  readonly hash: string;
  readonly salt: string;
}

export async function hashPin(pin: string): Promise<HashedPin> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(pin, salt, SCRYPT_KEYLEN);
  return { hash: derived.toString("hex"), salt };
}

/** Constant-time PIN check, so verification time does not leak how much matched. */
export async function verifyPin(pin: string, stored: HashedPin): Promise<boolean> {
  const derived = await scrypt(pin, stored.salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(stored.hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Last four characters, for display.
 *
 * This is the only part of a card code that is ever stored in the clear, and the only
 * part that may be shown or logged.
 */
export function last4(code: string): string {
  const normalised = normaliseCode(code);
  return normalised.slice(-4).padStart(4, "0");
}
