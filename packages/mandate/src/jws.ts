/**
 * Compact JWS over EdDSA (Ed25519), built on `node:crypto` alone.
 *
 * This is the "plain JWS" the plan settled on. AP2's real `PaymentMandate` is an SD-JWT-VC; that
 * is a large dependency for a demo whose point is the funding-and-consent *flow*, so this signs the
 * same claims with the same field names as a single-signature JOSE token — genuinely cryptographic,
 * genuinely tamper-evident, deliberately simpler than the spec and never wrong about it. Ed25519 is
 * a Node built-in, so there is no third-party signing dependency, which the plan also asked for.
 *
 * The serialization is RFC 7515 §3.1 compact form: `base64url(header).base64url(payload).base64url(sig)`.
 */
import { sign, verify, type KeyObject } from "node:crypto";

/** base64url without padding — the JOSE encoding, RFC 7515 Appendix C. */
export function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export interface JwsHeader {
  readonly alg: "EdDSA";
  readonly typ: string;
  /** Key id, so a verifier can select the right public key. */
  readonly kid: string;
}

/** A verified token, split back into its header and decoded claims. */
export interface VerifiedJws<Claims> {
  readonly header: JwsHeader;
  readonly claims: Claims;
}

/** Raised for any failure to verify — a wrong key, a bad signature, or a tampered segment. */
export class JwsVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwsVerificationError";
  }
}

/** Sign `claims` into a compact EdDSA JWS. `privateKey` must be an Ed25519 key. */
export function signJws<Claims>(claims: Claims, privateKey: KeyObject, header: JwsHeader): string {
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  // Ed25519 is a one-shot algorithm: the digest is fixed, so `sign` takes a null algorithm and
  // the message bytes directly (Node's documented contract for Ed25519 keys).
  const signature = sign(null, Buffer.from(signingInput, "utf8"), privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Verify a compact JWS against `publicKey` and return its header and claims.
 *
 * Throws `JwsVerificationError` on any tamper: flipping a byte of the header, the payload, or the
 * signature all fail here, because the signature is checked over the exact `header.payload` bytes
 * that were presented. This is what the "tamper one byte → rejection" test exercises.
 */
export function verifyJws<Claims>(compact: string, publicKey: KeyObject): VerifiedJws<Claims> {
  const parts = compact.split(".");
  if (parts.length !== 3) {
    throw new JwsVerificationError(`expected three JWS segments, got ${parts.length}`);
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  let ok: boolean;
  try {
    ok = verify(null, Buffer.from(signingInput, "utf8"), publicKey, fromBase64url(encodedSignature));
  } catch (err) {
    throw new JwsVerificationError(`signature check failed: ${(err as Error).message}`);
  }
  if (!ok) throw new JwsVerificationError("signature does not verify against the presented key");

  let header: JwsHeader;
  let claims: Claims;
  try {
    header = JSON.parse(fromBase64url(encodedHeader).toString("utf8")) as JwsHeader;
    claims = JSON.parse(fromBase64url(encodedPayload).toString("utf8")) as Claims;
  } catch (err) {
    throw new JwsVerificationError(`malformed JWS segment: ${(err as Error).message}`);
  }
  if (header.alg !== "EdDSA") {
    throw new JwsVerificationError(`unexpected alg "${header.alg}"; only EdDSA is accepted`);
  }
  return { header, claims };
}
