import type { ForgejoGateway } from "@/lib/forgejo/gateway";
import type { ActivityEvent } from "@/lib/forgejo/model";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "activity" });

export async function loadActivity(gateway: ForgejoGateway, limit = 12): Promise<ActivityEvent[]> {
  try {
    return await gateway.listActivity(limit);
  } catch (error) {
    log.warn({ err: (error as Error).message }, "activity feed unavailable");
    return [];
  }
}

const OP_LABELS: Record<string, string> = {
  create_repo: "created repository",
  rename_repo: "renamed repository",
  commit_repo: "pushed to",
  create_branch: "created branch",
  delete_branch: "deleted branch",
  create_tag: "created tag",
  delete_tag: "deleted tag",
  comment_issue: "commented on",
  create_issue: "opened issue",
  close_issue: "closed issue",
  reopen_issue: "reopened issue",
  merge_pull_request: "merged pull request",
  create_pull_request: "opened pull request",
  pull_review_approved: "approved",
  pull_review_rejected: "requested changes on",
  create_release: "published release",
};

export function describeActivity(event: ActivityEvent): string {
  return OP_LABELS[event.opType] ?? event.opType.replace(/_/g, " ");
}

export function activityTarget(event: ActivityEvent): string | null {
  if (!event.repoOwner || !event.repoName) return null;
  return `${event.repoOwner}/${event.repoName}`;
}
