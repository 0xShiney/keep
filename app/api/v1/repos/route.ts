import type { NextRequest } from "next/server";
import { apiContext } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { jsonResponse } from "@/lib/http/problem";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { createRepoSchema, searchSchema } from "@/lib/schemas";
import { forbidden } from "@/lib/errors";
import { listRepos } from "@/server/repos";
import { audit } from "@/server/audit";
import { idempotencyKey } from "@/lib/http/request";

export const GET = withApi(async (request, { requestId }) => {
  const { viewer, gateway } = await apiContext();
  const decision = authorize(viewer, "repo:read", { kind: "account", userId: viewer.userId });
  if (!decision.allowed) throw forbidden();

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    page: url.searchParams.get("page") ?? 1,
    limit: url.searchParams.get("limit") ?? 30,
  });
  const filters = parsed.success ? parsed.data : { q: "", page: 1, limit: 30 };

  const result = await listRepos(gateway, {
    query: filters.q,
    page: filters.page,
    limit: filters.limit,
  });

  return jsonResponse(
    {
      items: result.items,
      page: filters.page,
      limit: filters.limit,
      total: result.total,
      next: result.hasMore ? filters.page + 1 : null,
    },
    { requestId },
  );
});

export const POST = withApi(
  async (request: NextRequest, { requestId }) => {
    const { identity, viewer, gateway } = await apiContext();
    const decision = authorize(viewer, "repo:write", { kind: "system" });
    if (!decision.allowed) throw forbidden("Only the owner can create repositories");

    const input = await parseJson(request, createRepoSchema);
    const repo = await gateway.createRepo({
      name: input.name,
      description: input.description,
      private: input.private,
      autoInit: input.autoInit,
      gitignores: input.gitignore || undefined,
      license: input.license || undefined,
      readme: input.readme ? "Default" : undefined,
    });

    await audit({
      userId: identity.userId,
      action: "repo.create",
      resource: repo.fullName,
      requestId,
      metadata: {
        private: repo.private,
        autoInit: input.autoInit,
        idempotencyKey: idempotencyKey(request),
      },
    });

    return jsonResponse(repo, { status: 201, requestId });
  },
  { mutation: true },
);
