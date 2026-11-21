import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

function load(env: Record<string, string>): () => ReturnType<typeof getEnv> {
  resetEnvCache();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return () => getEnv();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("environment guards", () => {
  it("refuses fixture mode in production even with KEEP_FIXTURE_ACK=1", () => {
    const env = load({
      NODE_ENV: "production",
      KEEP_BACKEND: "fixture",
      KEEP_FIXTURE_ACK: "1",
      SESSION_SECRET: "a".repeat(40),
    });
    expect(env).toThrow(/not permitted when NODE_ENV=production/);
  });

  it("requires the acknowledgement for development fixture mode", () => {
    const env = load({
      NODE_ENV: "development",
      KEEP_BACKEND: "fixture",
      KEEP_FIXTURE_ACK: "0",
    });
    expect(env).toThrow(/KEEP_FIXTURE_ACK=1/);
  });

  it("allows development fixture mode with the acknowledgement", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("KEEP_BACKEND", "fixture");
    vi.stubEnv("KEEP_FIXTURE_ACK", "1");
    resetEnvCache();
    expect(getEnv().KEEP_BACKEND).toBe("fixture");
  });

  it("allows fixture mode in tests without an acknowledgement", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("KEEP_BACKEND", "fixture");
    resetEnvCache();
    expect(getEnv().KEEP_BACKEND).toBe("fixture");
  });

  it("fails fast in production when required forgejo settings are missing", () => {
    const env = load({
      NODE_ENV: "production",
      KEEP_BACKEND: "forgejo",
      FORGEJO_CLIENT_ID: "",
      DATABASE_URL: "",
      SESSION_SECRET: "dev-only-insecure-session-secret-change-me-32+chars",
    });
    expect(env).toThrow(/FORGEJO_CLIENT_ID, DATABASE_URL, SESSION_SECRET/);
  });
});
