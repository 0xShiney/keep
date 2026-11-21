import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgejoClient } from "@/lib/forgejo/client";

function stubFetch(status = 200, body = "{}") {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(status === 204 ? null : body, {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ForgejoClient", () => {
  it("sends JSON content-type on writes (Forgejo rejects bodies without it)", async () => {
    const calls = stubFetch();
    const client = new ForgejoClient({ baseUrl: "http://forgejo:3000", token: "t" });
    await client.send("POST", "/user/repos", { name: "demo" });

    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(calls[0].init.body).toBe('{"name":"demo"}');
  });

  it("uses bearer auth for normal clients and Basic auth for the broker", async () => {
    const calls = stubFetch();
    await new ForgejoClient({ baseUrl: "http://forgejo:3000", token: "abc" }).json("/user");
    await new ForgejoClient({
      baseUrl: "http://forgejo:3000",
      token: "",
      basicAuth: { username: "broker", password: "secret" },
    }).json("/user", { sudo: "keep" });

    const bearer = new Headers(calls[0].init.headers);
    const basic = new Headers(calls[1].init.headers);
    expect(bearer.get("authorization")).toBe("Bearer abc");
    expect(basic.get("authorization")).toBe(`Basic ${Buffer.from("broker:secret").toString("base64")}`);
    expect(basic.get("sudo")).toBe("keep");
  });

  it("keeps Basic auth on DELETE requests that need Sudo", async () => {
    const calls = stubFetch(204, "");
    await new ForgejoClient({
      baseUrl: "http://forgejo:3000",
      token: "",
      basicAuth: { username: "broker", password: "secret" },
    }).empty("DELETE", "/users/keep/tokens/demo", undefined, { sudoHeader: "keep" });

    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("sudo")).toBe("keep");
    expect(headers.get("authorization")).toContain("Basic ");
  });
});
