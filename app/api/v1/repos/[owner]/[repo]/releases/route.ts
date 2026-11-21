import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { idempotent } from "@/lib/http/idempotency";
import { createReleaseSchema } from "@/lib/schemas";

export const POST = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "release:write");
    const decision = authorize(viewer, "release:write", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    return idempotent(request, { userId: viewer.userId, requestId }, async () => {
      const input = await parseJson(request, createReleaseSchema);
      const release = await gateway.createRelease(params.owner, params.repo, input);
      return jsonResponse(release, { status: 201, requestId });
    });
  },
  { mutation: true },
);
