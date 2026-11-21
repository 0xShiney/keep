import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, clearCache } from "@/lib/cache";

afterEach(() => {
  clearCache();
});

describe("cached", () => {
  it("shares one in-flight request between concurrent callers", async () => {
    const load = vi.fn(async () => "value");
    const [a, b] = await Promise.all([
      cached("key", 1_000, load),
      cached("key", 1_000, load),
    ]);
    expect(a).toBe("value");
    expect(b).toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL expires", async () => {
    let calls = 0;
    const load = async () => ++calls;
    expect(await cached("key", 1, load)).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cached("key", 1, load)).toBe(2);
  });

  it("does not cache a rejected load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    await expect(cached("key", 1_000, load)).rejects.toThrow("boom");
    await expect(cached("key", 1_000, load)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keys entries per identity", async () => {
    expect(await cached("repos:alice", 1_000, async () => "alice")).toBe("alice");
    expect(await cached("repos:bob", 1_000, async () => "bob")).toBe("bob");
  });
});
