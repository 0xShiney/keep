import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "@/lib/env";

const TOKEN_CONTEXT = "keep/token-encryption/v1";
const HASH_CONTEXT = "keep/session-id/v1";

function secretMaterial(): Buffer {
  return Buffer.from(getEnv().SESSION_SECRET, "utf8");
}

function deriveKey(): Buffer {
  // HKDF gives us independent keys per purpose from one configured secret.
  const derived = hkdfSync("sha256", secretMaterial(), Buffer.alloc(0), TOKEN_CONTEXT, 32);
  return Buffer.from(derived);
}

/** base64url without padding — safe in cookies and URLs. */
export function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

/** Encrypts a secret for storage at rest: iv(12) | tag(16) | ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return base64url(Buffer.concat([iv, tag, ciphertext]));
}

export function decryptSecret(payload: string): string {
  const raw = fromBase64url(payload);
  if (raw.length < 29) throw new Error("Encrypted secret is malformed");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Session cookie values are stored hashed so a DB leak cannot resurrect sessions. */
export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(HASH_CONTEXT).update(sessionId).digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** PKCE S256 challenge from a verifier (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}
