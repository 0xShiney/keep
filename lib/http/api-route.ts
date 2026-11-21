import type { NextRequest } from "next/server";
import { problem, problemFromError, requestIdFrom } from "@/lib/http/problem";
import { assertSameOrigin, clientIp } from "@/lib/http/request";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";

export type ApiRouteContext<P> = { requestId: string; params: P };

/**
 * Wraps a route handler with: request id, origin/CSRF check for mutations,
 * per-IP rate limiting, and uniform problem-document error mapping.
 *
 * Authentication is NOT implicit here — each handler calls apiContext() and
 * authorize() explicitly, because a test enforces that every handler does.
 */
export function withApi<P extends Record<string, string> = Record<string, never>>(
  handler: (request: NextRequest, context: ApiRouteContext<P>) => Promise<Response>,
  options: { limit?: keyof typeof RATE_LIMITS; mutation?: boolean } = {},
) {
  return async function route(
    request: NextRequest,
    segment: { params: Promise<P> },
  ): Promise<Response> {
    const requestId = requestIdFrom(request);

    try {
      const isMutation =
        options.mutation ?? (request.method !== "GET" && request.method !== "HEAD");
      if (isMutation) assertSameOrigin(request);

      const bucket = RATE_LIMITS[options.limit ?? (isMutation ? "write" : "read")];
      const result = rateLimit(
        `${options.limit ?? "default"}:${clientIp(request)}`,
        bucket.limit,
        bucket.windowMs,
      );
      if (!result.allowed) {
        return problem(429, "Too many requests", "Slow down and try again shortly.", {
          requestId,
          headers: { "retry-after": String(result.retryAfterSeconds) },
        });
      }

      const params = ((await segment?.params) ?? {}) as P;
      const response = await handler(request, { requestId, params });
      if (!response.headers.has("x-request-id")) response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      return problemFromError(error, requestId);
    }
  };
}
