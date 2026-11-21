import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { jsonResponse } from "@/lib/http/problem";
import { refSchema } from "@/lib/schemas";

export const DELETE = withApi<{ owner: string; repo: string; tag: string }>(
  async (_request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "tag:write");
    const decision = authorize(viewer, "tag:write", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    const tag = decodeURIComponent(params.tag);
    if (!refSchema.safeParse(tag).success) throw badRequest("Invalid tag name");

    await gateway.deleteTag(params.owner, params.repo, tag);
    return jsonResponse({ deleted: tag }, { requestId });
  },
  { mutation: true },
);
