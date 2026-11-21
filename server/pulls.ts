import type { ForgejoGateway } from "@/lib/forgejo/gateway";
import type { Paginated, PullDetail, PullState, PullSummary } from "@/lib/forgejo/model";
import { parseUnifiedDiff, summarizeDiff, type ParsedDiff } from "@/lib/git/diff";

export async function listPulls(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  filters: { state: PullState; page: number; limit?: number },
): Promise<Paginated<PullSummary>> {
  return gateway.listPulls(owner, name, {
    state: filters.state,
    page: filters.page,
    limit: Math.min(filters.limit ?? 25, 50),
  });
}

export interface PullView {
  pull: PullDetail;
  diff: ParsedDiff | null;
  stats: { files: number; additions: number; deletions: number };
  truncated: boolean;
}

export async function loadPull(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  number: number,
): Promise<PullView> {
  const pull = await gateway.getPull(owner, name, number);
  const parsed = pull.diff ? parseUnifiedDiff(pull.diff) : null;
  return {
    pull,
    diff: parsed,
    stats: parsed
      ? summarizeDiff(parsed.files)
      : { files: pull.changedFiles, additions: pull.additions, deletions: pull.deletions },
    truncated: pull.diffTruncated || Boolean(parsed?.truncated),
  };
}

export function pullStatus(pull: PullSummary): "draft" | "open" | "merged" | "closed" {
  if (pull.merged) return "merged";
  if (pull.state === "closed") return "closed";
  if (pull.draft) return "draft";
  return "open";
}

export const MERGE_STYLES = [
  { value: "merge", label: "Create a merge commit" },
  { value: "squash", label: "Squash and merge" },
  { value: "rebase", label: "Rebase and merge" },
] as const;

export type MergeStyle = (typeof MERGE_STYLES)[number]["value"];
