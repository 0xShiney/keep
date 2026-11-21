import type { ForgejoGateway } from "@/lib/forgejo/gateway";
import type {
  BranchSummary,
  CommitDetail,
  CommitSummary,
  Paginated,
} from "@/lib/forgejo/model";
import { parseUnifiedDiff, summarizeDiff, type DiffFile, type ParsedDiff } from "@/lib/git/diff";

/**
 * 15 rather than 50: Forgejo's commit endpoint scales with page size (≈0.16 s
 * for 15 vs ≈0.44 s for 50 on the 5k-commit fixture), and the NFR allows 300 ms
 * for the whole page. 15 commits is still a screen of history before paging.
 */
export const DEFAULT_COMMIT_PAGE_SIZE = 15;

/**
 * Branch summaries already carry their head commit, so the tree page can skip a
 * separate `/commits` request (which costs ~170 ms on a 5k-commit repository).
 */
export function commitFromBranch(branch: BranchSummary): CommitSummary {
  return {
    sha: branch.sha,
    shortSha: branch.sha.slice(0, 7),
    message: branch.message,
    summaryLine: branch.message.split("\n")[0] ?? "",
    author: {
      name: branch.authorName,
      email: "",
      login: branch.authorLogin,
      avatarUrl: null,
      date: branch.date,
    },
    committer: null,
    parents: [],
    createdAt: branch.date,
    htmlUrl: null,
    verification: null,
  };
}

export async function listCommitHistory(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  options: { ref?: string; path?: string; page: number; limit?: number },
): Promise<Paginated<CommitSummary>> {
  return gateway.listCommits(owner, name, {
    ref: options.ref,
    path: options.path,
    page: options.page,
    limit: Math.min(options.limit ?? DEFAULT_COMMIT_PAGE_SIZE, 50),
  });
}

export interface CommitView {
  detail: CommitDetail;
  diff: ParsedDiff | null;
  diffFailed: boolean;
}

export async function loadCommit(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  sha: string,
): Promise<CommitView> {
  const detail = await gateway.getCommit(owner, name, sha);
  try {
    const text = await gateway.getCommitDiff(owner, name, sha);
    const diff = parseUnifiedDiff(text);
    return { detail, diff, diffFailed: false };
  } catch {
    return { detail, diff: null, diffFailed: true };
  }
}

export interface CompareView {
  commits: CommitSummary[];
  diff: ParsedDiff | null;
  stats: { files: number; additions: number; deletions: number };
  aheadBy: number;
  behindBy: number;
  truncated: boolean;
}

export async function loadCompare(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  base: string,
  head: string,
): Promise<CompareView> {
  const result = await gateway.compare(owner, name, base, head);
  const parsed = result.diff ? parseUnifiedDiff(result.diff) : null;
  return {
    commits: result.commits,
    diff: parsed,
    stats: parsed
      ? summarizeDiff(parsed.files)
      : { files: result.files.length, additions: 0, deletions: 0 },
    aheadBy: result.aheadBy,
    behindBy: result.behindBy,
    truncated: result.diffTruncated || Boolean(parsed?.truncated),
  };
}

export function fileAnchor(path: string): string {
  return `diff-${path.replace(/[^A-Za-z0-9]+/g, "-")}`;
}

export function totalLines(files: DiffFile[]): number {
  return files.reduce(
    (sum, file) => sum + file.hunks.reduce((hunkSum, hunk) => hunkSum + hunk.lines.length, 0),
    0,
  );
}
