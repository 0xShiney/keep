import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { updateIssueSchema } from "@/lib/schemas";

export const PATCH = withApi<{ owner: string; repo: string; number: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "issue:write");
    const decision = authorize(viewer, "issue:write", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    const number = Number.parseInt(params.number, 10);
    if (!Number.isInteger(number) || number < 1) throw badRequest("Invalid issue number");

    const input = await parseJson(request, updateIssueSchema);
    const issue = await gateway.updateIssue(params.owner, params.repo, number, input);
    return jsonResponse(issue, { requestId });
  },
  { mutation: true },
);
