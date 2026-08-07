/**
 * Ed25519 issuer keys for mandate signing.
 *
 * The agent is the issuer: it signs the mandates it emits, and any verifier — the planner, the
 * web audit surface — checks them against the matching public key. Keys are derived from a 32-byte
 * seed so the same seed always yields the same key id, which keeps the audit trail reproducible and
 * lets the agent and the web app share one issuer without a key-exchange dance in a single-process
 * demo. In a real deployment the seed would be a managed secret; here it may come from
 * `MANDATE_SIGNING_SEED` (base64url) and otherwise falls back to a fixed, clearly-labelled dev seed.
 */
import { createHash, createPrivateKey, createPublicKey, type JsonWebKey, type KeyObject } from "node:crypto";

import { base64url } from "./jws.js";

/**
 * The DER prefix for a PKCS#8-wrapped Ed25519 private key, up to the 32 raw seed bytes.
 * Prepending it to a seed yields a structure `createPrivateKey` accepts, which is how a bare seed
 * becomes a key without pulling in an ASN.1 library.
 */
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** A fixed dev seed. Reproducible on purpose; never use it to sign anything that matters. */
const DEV_SEED = createHash("sha256").update("pay-agent-dev-mandate-issuer").digest();

export interface IssuerKey {
  /** Key id, published in each mandate header so a verifier can select this key. */
  readonly kid: string;
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  /** The public key as a JWK, for advertising to verifiers that don't hold the KeyObject. */
  readonly publicJwk: JsonWebKey;
}

/** Derive `kid` from the public key bytes, so it is stable across processes for one seed. */
function keyIdFor(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  const raw = Buffer.from(String(jwk.x), "base64url");
  return `mk_${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`;
}

/** Build an issuer key from a 32-byte seed. */
export function issuerKeyFromSeed(seed: Buffer): IssuerKey {
  if (seed.length !== 32) {
    throw new RangeError(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  return { kid: keyIdFor(publicKey), privateKey, publicKey, publicJwk: publicKey.export({ format: "jwk" }) };
}

/**
 * The issuer key for this process: from `MANDATE_SIGNING_SEED` when set, else the dev seed.
 * Reading the env in one place keeps every consumer on the same key without each re-implementing
 * the fallback.
 */
export function loadIssuerKey(env: NodeJS.ProcessEnv = process.env): IssuerKey {
  const configured = env.MANDATE_SIGNING_SEED;
  if (configured) {
    const seed = Buffer.from(configured, "base64url");
    if (seed.length !== 32) {
      throw new RangeError("MANDATE_SIGNING_SEED must decode to 32 bytes (base64url)");
    }
    return issuerKeyFromSeed(seed);
  }
  return issuerKeyFromSeed(DEV_SEED);
}

/** Reconstruct a verifying key from a published JWK — the verifier's half of the split. */
export function publicKeyFromJwk(jwk: JsonWebKey): KeyObject {
  return createPublicKey({ key: jwk, format: "jwk" });
}

/** A verifying key: either a KeyObject the verifier holds, or a published JWK to reconstruct. */
export type VerifyingKey = KeyObject | JsonWebKey;

/** Normalize a verifying key to a KeyObject. Shared by the mandate and token verifiers. */
export function asVerifyingKey(key: VerifyingKey): KeyObject {
  return "export" in key && typeof (key as KeyObject).export === "function"
    ? (key as KeyObject)
    : publicKeyFromJwk(key as JsonWebKey);
}

/** Whether the process is running on the fixed dev seed — the honesty surfaces mark this. */
export function isDevIssuer(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.MANDATE_SIGNING_SEED;
}
