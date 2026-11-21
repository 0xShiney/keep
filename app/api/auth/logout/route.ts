import { NextResponse, type NextRequest } from "next/server";
import { destroyCurrentSession, getIdentity } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/request";
import { getEnv } from "@/lib/env";
import { problemFromError, requestIdFrom } from "@/lib/http/problem";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request);
  try {
    assertSameOrigin(request);
    const identity = await getIdentity();
    await destroyCurrentSession();
    if (identity) {
      await audit({
        userId: identity.userId,
        action: "auth.logout",
        resource: identity.username,
        requestId,
      });
    }

    const response = NextResponse.redirect(new URL("/login", getEnv().APP_ORIGIN), {
      status: 303,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    });
    // Clear both possible cookie names (https and http deployments).
    response.cookies.delete("keep_session");
    response.cookies.delete("__Host-keep_session");
    return response;
  } catch (error) {
    return problemFromError(error, requestId);
  }
}
