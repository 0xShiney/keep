import { apiContext } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { idempotent } from "@/lib/http/idempotency";
import { createTokenSchema } from "@/lib/schemas";
import { listTokens } from "@/server/account";
import { audit } from "@/server/audit";

export const GET = withApi(async (_request, { requestId }) => {
  const { viewer, gateway } = await apiContext();
  const decision = authorize(viewer, "account:read", { kind: "account", userId: viewer.userId });
  if (!decision.allowed) throw forbidden();

  return jsonResponse({ items: await listTokens(gateway) }, { requestId });
});

export const POST = withApi(
  async (request, { requestId }) => {
    const { identity, viewer, gateway } = await apiContext();
    const decision = authorize(viewer, "account:write", { kind: "account", userId: viewer.userId });
    if (!decision.allowed) throw forbidden();

    return idempotent(request, { userId: identity.userId, requestId }, async () => {
      const input = await parseJson(request, createTokenSchema);
      const token = await gateway.createToken(input.name, input.scopes);

      await audit({
        userId: identity.userId,
        action: "token.create",
        resource: `token:${input.name}`,
        requestId,
        metadata: { scopes: input.scopes },
      });

      // The token value is returned exactly once and never stored by Keep.
      return jsonResponse(token, {
        status: 201,
        requestId,
        headers: { "cache-control": "no-store" },
      });
    });
  },
  { mutation: true, limit: "token" },
);
