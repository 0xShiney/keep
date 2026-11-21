import { apiContext } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { jsonResponse } from "@/lib/http/problem";
import { audit } from "@/server/audit";

export const DELETE = withApi<{ id: string }>(
  async (_request, { requestId, params }) => {
    const { identity, viewer, gateway } = await apiContext();
    const decision = authorize(viewer, "account:write", { kind: "account", userId: viewer.userId });
    if (!decision.allowed) throw forbidden();

    const id = Number.parseInt(params.id, 10);
    if (!Number.isInteger(id) || id < 1) throw badRequest("Invalid key id");

    await gateway.deleteKey(id);
    await audit({
      userId: identity.userId,
      action: "key.delete",
      resource: `key:${id}`,
      requestId,
    });

    return jsonResponse({ deleted: id }, { requestId });
  },
  { mutation: true },
);
