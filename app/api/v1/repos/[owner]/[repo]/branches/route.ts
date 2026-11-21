import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { createBranchSchema } from "@/lib/schemas";

export const POST = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "repo:write");
    const decision = authorize(viewer, "repo:write", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    const input = await parseJson(request, createBranchSchema);
    await gateway.createBranch(params.owner, params.repo, input.name, input.from);
    return jsonResponse({ created: input.name, from: input.from }, { status: 201, requestId });
  },
  { mutation: true },
);
