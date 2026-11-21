import { apiContext } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { forbidden, notFound } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { jsonResponse } from "@/lib/http/problem";
import { revokeSession } from "@/server/account";
import { audit } from "@/server/audit";

export const DELETE = withApi<{ id: string }>(
  async (_request, { requestId, params }) => {
    const { identity, viewer } = await apiContext();
    const decision = authorize(viewer, "account:write", { kind: "account", userId: viewer.userId });
    if (!decision.allowed) throw forbidden();

    const handle = decodeURIComponent(params.id);
    if (!/^[a-f0-9]{6,64}$/.test(handle)) throw notFound("Session not found");

    const revoked = await revokeSession(handle, viewer.userId);
    if (!revoked) throw notFound("Session not found");

    await audit({
      userId: identity.userId,
      action: "session.revoke",
      resource: `session:${handle.slice(0, 8)}`,
      requestId,
    });

    return jsonResponse({ revoked: true }, { requestId });
  },
  { mutation: true },
);
