import { getEnv } from "@/lib/env";
import { sha256Hex } from "@/lib/crypto";
import { AppError, forbidden } from "@/lib/errors";

/**
 * CSRF protection for state-changing requests.
 *
 * A same-site cookie alone is not enough, so every mutation must carry an
 * Origin (or Referer) that matches this deployment. Requests without either
 * header are rejected: browsers always send Origin on cross-site POSTs, and our
 * own client always sends same-origin fetch requests.
 */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const candidate = origin ?? referer;

  if (!candidate) throw forbidden("Missing Origin header on a state-changing request");

  let candidateOrigin: string;
  try {
    candidateOrigin = new URL(candidate).origin;
  } catch {
    throw forbidden("Malformed Origin header");
  }

  const env = getEnv();
  const requestHost = request.headers.get("host");
  const requestProto = request.headers.get("x-forwarded-proto") ?? "http";
  const sameHost = requestHost ? candidateOrigin === `${requestProto}://${requestHost}` : false;

  if (candidateOrigin !== env.APP_ORIGIN && !sameHost) {
    throw forbidden("Cross-origin request rejected");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw forbidden("Cross-site request rejected");
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** IPs are only ever stored/logged hashed, and the hash is salted by secret. */
export function hashIp(ip: string): string {
  return sha256Hex(`ip:${getEnv().SESSION_SECRET}:${ip}`).slice(0, 32);
}

export function userAgentHash(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  return sha256Hex(`ua:${ua}`).slice(0, 32);
}

export function requireJsonBody(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError(415, "Unsupported media type", "Expected application/json");
  }
}

/** Idempotency keys are accepted and logged; single-user writes are not retried. */
export function idempotencyKey(request: Request): string | null {
  const key = request.headers.get("idempotency-key");
  if (!key) return null;
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(key)) {
    throw new AppError(400, "Bad request", "Idempotency-Key must be 8-128 safe characters");
  }
  return key;
}
