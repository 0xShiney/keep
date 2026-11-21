import { apiContext, repoForApi, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { idempotent } from "@/lib/http/idempotency";
import { createReviewSchema } from "@/lib/schemas";
import { newPositionForLine, parseUnifiedDiff } from "@/lib/git/diff";

export const POST = withApi<{ owner: string; repo: string; number: string }>(
  async (request, { requestId, params }) => {
    const { viewer, gateway } = await apiContext();
    const repo = await repoForApi(gateway, viewer, params.owner, params.repo, "pull:review");
    const decision = authorize(viewer, "pull:review", toRepoResource(repo));
    if (!decision.allowed) throw forbidden();

    const number = Number.parseInt(params.number, 10);
    if (!Number.isInteger(number) || number < 1) throw badRequest("Invalid pull request number");

    return idempotent(request, { userId: viewer.userId, requestId }, async () => {
      const input = await parseJson(request, createReviewSchema);

      // Inline comments arrive as (path, line). Forgejo anchors them by diff
      // position, so resolve that from the pull's own diff before submitting.
      let parsedDiff: ReturnType<typeof parseUnifiedDiff> | null = null;
      if (input.comments?.some((comment) => comment.line !== undefined)) {
        const diffText = await gateway.getPullDiff(params.owner, params.repo, number);
        parsedDiff = parseUnifiedDiff(diffText);
      }

      const comments = (input.comments ?? []).map((comment) => {
        if (comment.new_position !== undefined) {
          return {
            path: comment.path,
            body: comment.body,
            new_position: comment.new_position,
            old_position: comment.old_position,
          };
        }

        const file = parsedDiff?.files.find((candidate) => candidate.path === comment.path);
        const position = file && comment.line ? newPositionForLine(file, comment.line) : null;
        if (position === null) {
          throw badRequest(`Could not anchor a comment on ${comment.path}:${comment.line ?? "?"}`);
        }
        return { path: comment.path, body: comment.body, new_position: position };
      });

      await gateway.createPullReview(params.owner, params.repo, number, {
        event: input.event,
        body: input.body,
        comments,
      });

      return jsonResponse({ submitted: true, event: input.event }, { status: 201, requestId });
    });
  },
  { mutation: true },
);
