import { apiContext } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { jsonResponse } from "@/lib/http/problem";
import { audit } from "@/server/audit";

export const DELETE = withApi<{ name: string }>(
  async (_request, { requestId, params }) => {
    const { identity, viewer, gateway } = await apiContext();
    const decision = authorize(viewer, "account:write", { kind: "account", userId: viewer.userId });
    if (!decision.allowed) throw forbidden();

    const name = decodeURIComponent(params.name);
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw badRequest("Invalid token name");

    await gateway.deleteToken(name);
    await audit({
      userId: identity.userId,
      action: "token.revoke",
      resource: `token:${name}`,
      requestId,
    });

    return jsonResponse({ revoked: name }, { requestId });
  },
  { mutation: true, limit: "token" },
);
