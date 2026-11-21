import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getIdempotencyStore,
  idempotent,
  resetIdempotencyStore,
  IDEMPOTENCY_TTL_MS,
} from "@/lib/http/idempotency";
import { AppError } from "@/lib/errors";

function createRequest(body: unknown, key?: string, path = "/api/v1/repos"): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (key) headers.set("idempotency-key", key);
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function ok(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const scope = { userId: 7, requestId: "req-test-0001" };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetIdempotencyStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetIdempotencyStore();
});

describe("idempotent()", () => {
  it("passes through when no Idempotency-Key is supplied", async () => {
    const handler = vi.fn(async () => ok({ id: 1 }));
    await idempotent(createRequest({ name: "x" }), scope, handler);
    await idempotent(createRequest({ name: "x" }), scope, handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("replays the stored response instead of running the handler twice", async () => {
    const handler = vi.fn(async () => ok({ fullName: "keep/demo", id: 42 }));
    const first = await idempotent(createRequest({ name: "demo" }, "key-abc-123"), scope, handler);
    const second = await idempotent(createRequest({ name: "demo" }, "key-abc-123"), scope, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(await second.json()).toEqual({ fullName: "keep/demo", id: 42 });
  });

  it("scopes keys per user, method and path", async () => {
    const handler = vi.fn(async () => ok({ ok: true }));
    await idempotent(createRequest({ a: 1 }, "shared-key-1"), { userId: 1, requestId: "r1" }, handler);
    await idempotent(createRequest({ a: 1 }, "shared-key-1"), { userId: 2, requestId: "r2" }, handler);
    await idempotent(
      createRequest({ a: 1 }, "shared-key-1", "/api/v1/keys"),
      { userId: 1, requestId: "r3" },
      handler,
    );
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("rejects reuse of a key with a different body", async () => {
    const handler = vi.fn(async () => ok({ ok: true }));
    await idempotent(createRequest({ name: "one" }, "key-conflict-1"), scope, handler);

    await expect(
      idempotent(createRequest({ name: "two" }, "key-conflict-1"), scope, handler),
    ).rejects.toMatchObject({ status: 422 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns 409 while the first request is still in flight", async () => {
    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const key = "key-inflight-1";

    const inFlight = idempotent(createRequest({ name: "slow" }, key), scope, () => gate);

    await expect(
      idempotent(createRequest({ name: "slow" }, key), scope, async () => ok({ ok: true })),
    ).rejects.toMatchObject({ status: 409 });

    release(ok({ ok: true }));
    const response = await inFlight;
    expect(response.status).toBe(201);
  });

  it("releases the reservation when the handler throws so a retry can succeed", async () => {
    const key = "key-retry-1";
    await expect(
      idempotent(createRequest({ name: "x" }, key), scope, async () => {
        throw new AppError(502, "Upstream error", "boom");
      }),
    ).rejects.toBeInstanceOf(AppError);

    const handler = vi.fn(async () => ok({ ok: true }));
    const retry = await idempotent(createRequest({ name: "x" }, key), scope, handler);
    expect(retry.status).toBe(201);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed keys with a 400 problem", async () => {
    await expect(
      idempotent(createRequest({ name: "x" }, "short"), scope, async () => ok({})),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("retakes an expired reservation", async () => {
    const key = "key-expired-1";
    const store = getIdempotencyStore();
    const request = createRequest({ name: "x" }, key);
    const rawBody = await request.clone().text();
    const { sha256Hex } = await import("@/lib/crypto");
    const id = sha256Hex(`7\nPOST\n/api/v1/repos\n${key}`);
    await store.reserve({
      id,
      userId: 7,
      method: "POST",
      path: "/api/v1/repos",
      key,
      fingerprint: sha256Hex(`POST\n/api/v1/repos\n${rawBody}`),
      state: "completed",
      status: 201,
      response: '{"stale":true}',
      contentType: "application/json",
      createdAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1000),
      expiresAt: new Date(Date.now() - 1000),
    });

    const handler = vi.fn(async () => ok({ fresh: true }));
    const response = await idempotent(createRequest({ name: "x" }, key), scope, handler);
    expect(await response.json()).toEqual({ fresh: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
