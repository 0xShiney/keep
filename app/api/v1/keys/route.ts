import { apiContext } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { addKeySchema } from "@/lib/schemas";
import { listKeys, looksLikeSshKey } from "@/server/account";
import { audit } from "@/server/audit";

export const GET = withApi(async (_request, { requestId }) => {
  const { viewer, gateway } = await apiContext();
  const decision = authorize(viewer, "account:read", { kind: "account", userId: viewer.userId });
  if (!decision.allowed) throw forbidden();

  return jsonResponse({ items: await listKeys(gateway) }, { requestId });
});

export const POST = withApi(
  async (request, { requestId }) => {
    const { identity, viewer, gateway } = await apiContext();
    const decision = authorize(viewer, "account:write", { kind: "account", userId: viewer.userId });
    if (!decision.allowed) throw forbidden();

    const input = await parseJson(request, addKeySchema);
    if (!looksLikeSshKey(input.key)) {
      throw badRequest(
        "That does not look like an OpenSSH public key (ssh-ed25519, ssh-rsa, ecdsa-…)",
      );
    }

    const key = await gateway.addKey(input.title, input.key.trim());
    await audit({
      userId: identity.userId,
      action: "key.create",
      resource: `key:${key.id}`,
      requestId,
      metadata: { title: key.title },
    });

    return jsonResponse(key, { status: 201, requestId });
  },
  { mutation: true, limit: "token" },
);
