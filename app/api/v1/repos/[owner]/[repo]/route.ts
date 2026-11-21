import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, conflict, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { deleteRepoSchema, updateRepoSchema } from "@/lib/schemas";
import { audit } from "@/server/audit";
import { forgetRecentRepo, recordRepoAccess } from "@/server/repos";

export const GET = withApi<{ owner: string; repo: string }>(
  async (_request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "repo:read");
    const decision = authorize(viewer, "repo:read", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    return jsonResponse(repo, { requestId });
  },
  { limit: "read" },
);

export const PATCH = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { identity, viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "repo:admin");
    const decision = authorize(viewer, "repo:admin", toRepoResource(repo));
    if (!decision.allowed) throw forbidden("Repository administration requires admin permission");

    const input = await parseJson(request, updateRepoSchema);
    const updated = await gateway.updateRepo(params.owner, params.repo, {
      name: input.name,
      description: input.description,
      private: input.private,
      defaultBranch: input.defaultBranch,
      archived: input.archived,
    });

    if (updated.fullName !== repo.fullName) {
      await forgetRecentRepo(identity.userId, repo.fullName);
    }
    await recordRepoAccess(identity.userId, updated.fullName);

    await audit({
      userId: identity.userId,
      action: "repo.update",
      resource: updated.fullName,
      requestId,
      metadata: { fields: Object.keys(input) },
    });

    return jsonResponse(updated, { requestId });
  },
  { mutation: true },
);

export const DELETE = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { identity, viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "repo:admin");
    const decision = authorize(viewer, "repo:admin", toRepoResource(repo));
    if (!decision.allowed) throw forbidden("Only an administrator can delete a repository");

    const input = await parseJson(request, deleteRepoSchema);
    if (input.confirm !== repo.name && input.confirm !== repo.fullName) {
      throw badRequest(`Type ${repo.name} to confirm deletion`);
    }
    if (repo.archived) {
      throw conflict("Archived repositories must be unarchived before deletion");
    }

    await gateway.deleteRepo(params.owner, params.repo);
    await forgetRecentRepo(identity.userId, repo.fullName);

    await audit({
      userId: identity.userId,
      action: "repo.delete",
      resource: repo.fullName,
      requestId,
    });

    return jsonResponse({ deleted: repo.fullName }, { requestId });
  },
  { mutation: true },
);
