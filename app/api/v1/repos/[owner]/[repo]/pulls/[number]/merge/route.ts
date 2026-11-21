import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, conflict, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { mergePullSchema } from "@/lib/schemas";
import { audit } from "@/server/audit";

export const POST = withApi<{ owner: string; repo: string; number: string }>(
  async (request, { requestId, params }) => {
    const { identity, viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "pull:merge");
    const decision = authorize(viewer, "pull:merge", toRepoResource(repo));
    if (!decision.allowed) throw forbidden("Merging requires write access");

    const number = Number.parseInt(params.number, 10);
    if (!Number.isInteger(number) || number < 1) throw badRequest("Invalid pull request number");

    const input = await parseJson(request, mergePullSchema);

    const pull = await gateway.getPull(params.owner, params.repo, number);
    if (pull.merged) throw conflict("This pull request is already merged");
    if (!pull.mergeable) {
      throw conflict("This pull request has conflicts and cannot be merged as-is");
    }

    await gateway.mergePull(params.owner, params.repo, number, {
      style: input.style,
      message: input.message,
    });

    await audit({
      userId: identity.userId,
      action: "pull.merge",
      resource: `${params.owner}/${params.repo}#${number}`,
      requestId,
      metadata: { style: input.style },
    });

    return jsonResponse({ merged: true, number, style: input.style }, { requestId });
  },
  { mutation: true },
);
