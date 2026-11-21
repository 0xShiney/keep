import { NextResponse, type NextRequest } from "next/server";
import { createSession, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { isFixtureMode } from "@/lib/forgejo";
import { createGateway } from "@/lib/forgejo";
import { problem } from "@/lib/http/problem";
import { assertSameOrigin, clientIp, hashIp, userAgentHash } from "@/lib/http/request";
import { getEnv } from "@/lib/env";
import { requestIdFrom } from "@/lib/http/problem";

export const dynamic = "force-dynamic";

/**
 * Demo-only sign-in. Refused unless KEEP_BACKEND=fixture (which itself requires
 * KEEP_FIXTURE_ACK outside tests). It exists so the UI can be reviewed without a
 * Forgejo instance; it is never a production auth path.
 */
export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request);

  if (!isFixtureMode()) {
    return problem(404, "Not found", "Demo sign-in is disabled.", { requestId });
  }

  try {
    assertSameOrigin(request);
    const gateway = createGateway("fixture", "");
    const user = await gateway.getUser();

    const { sessionId, maxAgeSeconds } = await createSession(
      user,
      { accessToken: "fixture-token", refreshToken: null, expiresInSeconds: 3600 },
      { userAgentHash: userAgentHash(request), ipHash: hashIp(clientIp(request)) },
    );

    const response = NextResponse.redirect(new URL("/", getEnv().APP_ORIGIN), {
      status: 303,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    });
    response.cookies.set(sessionCookieName(), sessionId, sessionCookieOptions(maxAgeSeconds));
    return response;
  } catch (error) {
    return problem(400, "Demo sign-in failed", (error as Error).message, { requestId });
  }
}
