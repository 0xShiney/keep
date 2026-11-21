import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { idempotent } from "@/lib/http/idempotency";
import { createTagSchema } from "@/lib/schemas";

export const POST = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "tag:write");
    const decision = authorize(viewer, "tag:write", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    return idempotent(request, { userId: viewer.userId, requestId }, async () => {
      const input = await parseJson(request, createTagSchema);
      await gateway.createTag(params.owner, params.repo, input.tag, input.target);
      return jsonResponse({ tag: input.tag, target: input.target }, { status: 201, requestId });
    });
  },
  { mutation: true },
);
