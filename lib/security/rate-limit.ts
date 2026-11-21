/**
 * Fixed-window rate limiter.
 *
 * Keep is a single-owner, single-instance deployment, so an in-process limiter
 * is the simplest thing that works. Caddy additionally rate-limits Git and app
 * traffic at the edge (see deploy/Caddyfile), which covers the multi-connection
 * case. If the app is ever scaled horizontally this must move to Postgres.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (now - lastSweep > 60_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    lastSweep = now;
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, limit, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    limit,
    retryAfterSeconds: 0,
  };
}

export const RATE_LIMITS = {
  login: { limit: 20, windowMs: 60_000 },
  token: { limit: 10, windowMs: 60_000 },
  write: { limit: 60, windowMs: 60_000 },
  read: { limit: 600, windowMs: 60_000 },
} as const;

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}
