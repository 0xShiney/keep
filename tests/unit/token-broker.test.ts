import { afterEach, describe, expect, it, vi } from "vitest";
import { brokerStatus, tokenManagementConfigured } from "@/lib/forgejo/token-broker";
import { resetEnvCache } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("token broker configuration", () => {
  it("is disabled when no broker is configured", () => {
    expect(brokerStatus({ brokerUser: "", brokerPassword: "", ownerLogin: "keep" })).toEqual({
      configured: false,
      reason: expect.stringContaining("FORGEJO_BROKER_USER"),
    });
  });

  it("refuses to use the owner's own login as the broker account", () => {
    const status = brokerStatus({
      brokerUser: "Keep",
      brokerPassword: "x".repeat(24),
      ownerLogin: "keep",
    });
    expect(status.configured).toBe(false);
    expect(status.reason).toMatch(/separate service account/);
  });

  it("rejects a short broker password", () => {
    const status = brokerStatus({
      brokerUser: "keep-token-broker",
      brokerPassword: "short",
      ownerLogin: "keep",
    });
    expect(status.configured).toBe(false);
    expect(status.reason).toMatch(/at least 16 characters/);
  });

  it("requires both broker variables", () => {
    const status = brokerStatus({
      brokerUser: "keep-token-broker",
      brokerPassword: "",
      ownerLogin: "keep",
    });
    expect(status.configured).toBe(false);
    expect(status.reason).toMatch(/both FORGEJO_BROKER_USER and FORGEJO_BROKER_PASSWORD/);
  });

  it("accepts a dedicated broker account", () => {
    expect(
      brokerStatus({
        brokerUser: "keep-token-broker",
        brokerPassword: "r".repeat(32),
        ownerLogin: "keep",
      }).configured,
    ).toBe(true);
  });

  it("reads the deployed environment when no override is given", () => {
    vi.stubEnv("FORGEJO_BROKER_USER", "keep-token-broker");
    vi.stubEnv("FORGEJO_BROKER_PASSWORD", "p".repeat(32));
    vi.stubEnv("KEEP_OWNER_LOGIN", "keep");
    resetEnvCache();
    expect(tokenManagementConfigured()).toBe(true);
  });
});
