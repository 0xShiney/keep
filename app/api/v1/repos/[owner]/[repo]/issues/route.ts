import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { idempotent } from "@/lib/http/idempotency";
import { createIssueSchema } from "@/lib/schemas";
import { listIssues } from "@/server/issues";

export const GET = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "issue:read");
    const decision = authorize(viewer, "issue:read", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    const url = new URL(request.url);
    const stateParam = url.searchParams.get("state");
    const state = stateParam === "closed" || stateParam === "all" ? stateParam : "open";
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    const result = await listIssues(gateway, params.owner, params.repo, {
      state,
      label: url.searchParams.get("label") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
      page,
      limit: 25,
    });

    return jsonResponse({ ...result, page }, { requestId });
  },
  { limit: "read" },
);

export const POST = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "issue:write");
    const decision = authorize(viewer, "issue:write", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    return idempotent(request, { userId: viewer.userId, requestId }, async () => {
      const input = await parseJson(request, createIssueSchema);
      const issue = await gateway.createIssue(params.owner, params.repo, {
        title: input.title,
        body: input.body,
        labels: input.labels,
      });

      return jsonResponse(issue, { status: 201, requestId });
    });
  },
  { mutation: true },
);
