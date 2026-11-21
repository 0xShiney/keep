import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashSessionId,
  pkceChallenge,
  randomToken,
  safeEqual,
} from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-chars-long";
  resetEnvCache();
});

describe("secret encryption", () => {
  it("round-trips", () => {
    const plaintext = "forgejo-access-token-abc123";
    const cipher = encryptSecret(plaintext);
    expect(cipher).not.toContain(plaintext);
    expect(decryptSecret(cipher)).toBe(plaintext);
  });

  it("uses a fresh IV per encryption", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const cipher = encryptSecret("secret");
    const tampered = `${cipher.slice(0, -2)}${cipher.endsWith("AA") ? "BB" : "AA"}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects garbage", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow();
  });
});

describe("hashing and PKCE", () => {
  it("hashes session ids deterministically and distinctly", () => {
    expect(hashSessionId("abc")).toBe(hashSessionId("abc"));
    expect(hashSessionId("abc")).not.toBe(hashSessionId("abd"));
    expect(hashSessionId("abc")).toHaveLength(64);
  });

  it("matches the RFC 7636 S256 test vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("generates URL-safe random tokens", () => {
    const token = randomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(40);
    expect(randomToken(32)).not.toBe(token);
  });

  it("compares without leaking length differences", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
