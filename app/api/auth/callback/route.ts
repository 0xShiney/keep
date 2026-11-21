import { NextResponse, type NextRequest } from "next/server";
import { consumeOAuthState, exchangeCodeForTokens } from "@/lib/auth/oauth";
import { createSession, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { ForgejoClient } from "@/lib/forgejo/client";
import { mapUser, type ApiUser } from "@/lib/forgejo/mappers";
import { getEnv } from "@/lib/env";
import { clientIp, hashIp, userAgentHash } from "@/lib/http/request";
import { childLogger } from "@/lib/logger";
import { audit } from "@/server/audit";

const log = childLogger({ module: "auth-callback" });

function failure(request: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, getEnv().APP_ORIGIN), {
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  if (url.searchParams.get("error")) {
    log.warn(
      { requestId, error: url.searchParams.get("error") },
      "identity provider returned an error",
    );
    return failure(request, "exchange");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code) return failure(request, "state");

  try {
    const stored = await consumeOAuthState(state);
    const tokens = await exchangeCodeForTokens(code, stored.verifier);

    const client = ForgejoClient.fromEnv(tokens.accessToken);
    const { data } = await client.json<ApiUser>("/user");
    const user = mapUser(data);

    const { sessionId, maxAgeSeconds } = await createSession(
      user,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSeconds: tokens.expiresInSeconds,
      },
      {
        userAgentHash: userAgentHash(request),
        ipHash: hashIp(clientIp(request)),
      },
    );

    await audit({
      userId: user.id,
      action: "auth.login",
      resource: user.login,
      requestId,
    });

    const response = NextResponse.redirect(new URL(stored.next, getEnv().APP_ORIGIN), {
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    });
    response.cookies.set(sessionCookieName(), sessionId, sessionCookieOptions(maxAgeSeconds));
    return response;
  } catch (error) {
    log.error({ requestId, err: (error as Error).message }, "OAuth callback failed");
    return failure(request, "session");
  }
}
