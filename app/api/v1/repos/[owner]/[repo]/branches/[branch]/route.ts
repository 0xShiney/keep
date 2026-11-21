import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { jsonResponse } from "@/lib/http/problem";
import { refSchema } from "@/lib/schemas";

export const DELETE = withApi<{ owner: string; repo: string; branch: string }>(
  async (_request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "repo:write");
    const decision = authorize(viewer, "repo:write", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    const branch = decodeURIComponent(params.branch);
    const parsed = refSchema.safeParse(branch);
    if (!parsed.success) throw badRequest("Invalid branch name");
    if (branch === repo.defaultBranch) throw badRequest("The default branch cannot be deleted");

    await gateway.deleteBranch(params.owner, params.repo, branch);
    return jsonResponse({ deleted: branch }, { requestId });
  },
  { mutation: true },
);
