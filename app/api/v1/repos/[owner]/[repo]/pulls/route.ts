import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { idempotent } from "@/lib/http/idempotency";
import { createPullSchema } from "@/lib/schemas";
import { listPulls } from "@/server/pulls";

export const GET = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "pull:read");
    const decision = authorize(viewer, "pull:read", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    const url = new URL(request.url);
    const stateParam = url.searchParams.get("state");
    const state = stateParam === "closed" || stateParam === "all" ? stateParam : "open";
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    const result = await listPulls(gateway, params.owner, params.repo, { state, page, limit: 25 });
    return jsonResponse({ ...result, page }, { requestId });
  },
  { limit: "read" },
);

export const POST = withApi<{ owner: string; repo: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "pull:write");
    const decision = authorize(viewer, "pull:write", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    return idempotent(request, { userId: viewer.userId, requestId }, async () => {
      const input = await parseJson(request, createPullSchema);
      const pull = await gateway.createPull(params.owner, params.repo, input);
      return jsonResponse(pull, { status: 201, requestId });
    });
  },
  { mutation: true },
);
