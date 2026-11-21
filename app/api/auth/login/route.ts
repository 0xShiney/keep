import { NextResponse, type NextRequest } from "next/server";
import { beginOAuth, safeNextPath } from "@/lib/auth/oauth";
import { problem, problemFromError, requestIdFrom } from "@/lib/http/problem";
import { clientIp } from "@/lib/http/request";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { getEnv } from "@/lib/env";
import { isFixtureMode } from "@/lib/forgejo";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "auth-login" });

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request);

  try {
    const limit = rateLimit(
      `login:${clientIp(request)}`,
      RATE_LIMITS.login.limit,
      RATE_LIMITS.login.windowMs,
    );
    if (!limit.allowed) {
      return problem(429, "Too many requests", "Too many sign-in attempts. Wait a minute.", {
        requestId,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      });
    }

    if (isFixtureMode()) {
      // In demo mode there is no identity provider; the login page posts to
      // /api/auth/demo instead. Never silently create a session from a GET.
      return NextResponse.redirect(new URL("/login", getEnv().APP_ORIGIN));
    }

    const next = safeNextPath(new URL(request.url).searchParams.get("next"));
    const { url } = await beginOAuth(next);
    return NextResponse.redirect(url, {
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    });
  } catch (error) {
    log.error({ requestId, err: (error as Error).message }, "could not start OAuth");
    return problemFromError(error, requestId);
  }
}
