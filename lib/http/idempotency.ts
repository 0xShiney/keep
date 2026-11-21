import { eq, lt } from "drizzle-orm";
import { idempotencyRecord } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { childLogger } from "@/lib/logger";
import { idempotencyKey } from "./request";

const log = childLogger({ module: "idempotency" });

/** Stripe-compatible retention window for replayed writes. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A pending record older than this was abandoned (process crash, timeout) and
 * may be retaken. Kept short so a crashed request cannot block retries for a day.
 */
export const IDEMPOTENCY_PENDING_STALE_MS = 60 * 1000;

export interface IdempotencyEntry {
  id: string;
  userId: number;
  method: string;
  path: string;
  key: string;
  fingerprint: string;
  state: "pending" | "completed";
  status: number | null;
  response: string | null;
  contentType: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyStore {
  reserve(entry: IdempotencyEntry): Promise<{ outcome: "reserved" | "exists"; existing?: IdempotencyEntry }>;
  complete(id: string, status: number, body: string, contentType: string): Promise<void>;
  release(id: string): Promise<void>;
  get(id: string): Promise<IdempotencyEntry | null>;
  purgeExpired(now: Date): Promise<void>;
}

class PostgresIdempotencyStore implements IdempotencyStore {
  async reserve(entry: IdempotencyEntry) {
    const inserted = await getDb()
      .insert(idempotencyRecord)
      .values(entry)
      .onConflictDoNothing({ target: idempotencyRecord.id })
      .returning({ id: idempotencyRecord.id });

    if (inserted.length > 0) return { outcome: "reserved" as const };

    const existing = await this.get(entry.id);
    return existing
      ? { outcome: "exists" as const, existing }
      : // The row vanished between the insert and the read; let the caller retry.
        { outcome: "reserved" as const };
  }

  async complete(id: string, status: number, body: string, contentType: string): Promise<void> {
    await getDb()
      .update(idempotencyRecord)
      .set({ state: "completed", status, response: body, contentType })
      .where(eq(idempotencyRecord.id, id));
  }

  async release(id: string): Promise<void> {
    await getDb().delete(idempotencyRecord).where(eq(idempotencyRecord.id, id));
  }

  async get(id: string): Promise<IdempotencyEntry | null> {
    const rows = await getDb()
      .select()
      .from(idempotencyRecord)
      .where(eq(idempotencyRecord.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      state: row.state === "completed" ? "completed" : "pending",
    };
  }

  async purgeExpired(now: Date): Promise<void> {
    await getDb()
      .delete(idempotencyRecord)
      .where(lt(idempotencyRecord.expiresAt, now));
  }
}

interface GlobalWithIdempotency {
  __keepIdempotency?: Map<string, IdempotencyEntry>;
}

const globalForIdempotency = globalThis as unknown as GlobalWithIdempotency;

/**
 * In-process store used only when DATABASE_URL is absent (tests and local
 * previews). Production requires DATABASE_URL, so the durable path is the
 * Postgres one; the semantics below are identical so tests exercise the contract.
 */
class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = (globalForIdempotency.__keepIdempotency ??= new Map<
    string,
    IdempotencyEntry
  >());

  async reserve(entry: IdempotencyEntry) {
    const existing = this.entries.get(entry.id);
    if (existing) return { outcome: "exists" as const, existing };
    this.entries.set(entry.id, entry);
    return { outcome: "reserved" as const };
  }

  async complete(id: string, status: number, body: string, contentType: string): Promise<void> {
    const existing = this.entries.get(id);
    if (!existing) return;
    this.entries.set(id, { ...existing, state: "completed", status, response: body, contentType });
  }

  async release(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async get(id: string): Promise<IdempotencyEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async purgeExpired(now: Date): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

export function getIdempotencyStore(): IdempotencyStore {
  return isDatabaseConfigured() ? new PostgresIdempotencyStore() : new MemoryIdempotencyStore();
}

/** Test helper. */
export function resetIdempotencyStore(): void {
  globalForIdempotency.__keepIdempotency = undefined;
}

function replay(entry: IdempotencyEntry, requestId: string): Response {
  return new Response(entry.response ?? "", {
    status: entry.status ?? 200,
    headers: {
      "content-type": entry.contentType ?? "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
      "idempotent-replayed": "true",
    },
  });
}

/**
 * Executes a create handler at most once per (user, method, path, key).
 *
 * The key is optional: without it the request is processed normally (documented
 * in docs/API.md). With it:
 *  - first call reserves the key, runs the handler and stores the response;
 *  - a retry with the same body replays the stored status/body;
 *  - a retry with a different body is rejected (422) instead of silently
 *    returning a response for another request;
 *  - a concurrent retry while the first is still running gets 409 + Retry-After.
 */
export async function idempotent(
  request: Request,
  options: { userId: number; requestId: string },
  handler: () => Promise<Response>,
): Promise<Response> {
  const key = idempotencyKey(request);
  if (!key) return handler();

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;

  // Read a clone so the handler can still consume the body itself.
  const rawBody = await request.clone().text();
  const fingerprint = sha256Hex(`${method}\n${path}\n${rawBody}`);
  const id = sha256Hex(`${options.userId}\n${method}\n${path}\n${key}`);

  const store = getIdempotencyStore();
  const now = Date.now();
  const entry: IdempotencyEntry = {
    id,
    userId: options.userId,
    method,
    path,
    key,
    fingerprint,
    state: "pending",
    status: null,
    response: null,
    contentType: null,
    createdAt: new Date(now),
    expiresAt: new Date(now + IDEMPOTENCY_TTL_MS),
  };

  let reservation = await store.reserve(entry);

  // Expired or abandoned reservations may be retaken.
  if (reservation.outcome === "exists" && reservation.existing) {
    const existing = reservation.existing;
    const expired = existing.expiresAt.getTime() <= now;
    const stale = existing.state === "pending" && now - existing.createdAt.getTime() > IDEMPOTENCY_PENDING_STALE_MS;
    if (expired || stale) {
      await store.release(id);
      reservation = await store.reserve(entry);
    }
  }

  if (reservation.outcome === "exists" && reservation.existing) {
    const existing = reservation.existing;

    if (existing.fingerprint !== fingerprint) {
      throw new AppError(
        422,
        "Idempotency-Key reused",
        "This Idempotency-Key was already used with a different request body.",
      );
    }

    if (existing.state === "pending") {
      throw new AppError(
        409,
        "Request in progress",
        "A request with this Idempotency-Key is still being processed. Retry shortly.",
      );
    }

    log.info({ requestId: options.requestId, path }, "replayed idempotent response");
    return replay(existing, options.requestId);
  }

  try {
    const response = await handler();
    const body = await response.clone().text();
    await store.complete(
      id,
      response.status,
      body,
      response.headers.get("content-type") ?? "application/json; charset=utf-8",
    );
    return response;
  } catch (error) {
    // Nothing was written from the caller's perspective: let a retry try again.
    await store.release(id);
    throw error;
  }
}
