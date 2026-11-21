import Link from "next/link";
import { GitCommitHorizontal } from "lucide-react";
import type { CommitSummary } from "@/lib/forgejo/model";
import { formatRelativeTime } from "@/lib/utils";

export function CommitList({
  commits,
  owner,
  repo,
  showRepo = false,
}: {
  commits: CommitSummary[];
  owner: string;
  repo: string;
  showRepo?: boolean;
}) {
  if (commits.length === 0) {
    return (
      <p className="text-fg-subtle px-3 py-6 text-center text-xs">
        No commits yet. Push to this repository to see history here.
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {commits.map((commit) => (
        <li key={commit.sha} className="group hover:bg-surface-2 px-3 py-2 transition-colors">
          <div className="flex items-start gap-2">
            <GitCommitHorizontal
              aria-hidden="true"
              className="text-fg-subtle mt-0.5 size-3.5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/${owner}/${repo}/commits/${commit.sha}`}
                className="text-fg hover:text-accent line-clamp-2 text-xs font-medium hover:underline"
              >
                {commit.summaryLine || "(no message)"}
              </Link>
              <div className="text-2xs text-fg-subtle mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-fg-muted font-medium">{commit.author.name}</span>
                <span>committed {formatRelativeTime(commit.createdAt)}</span>
                <Link
                  href={`/${owner}/${repo}/commits/${commit.sha}`}
                  className="border-border bg-surface-2 text-fg-muted hover:text-fg rounded-sm border px-1.5 py-px font-mono"
                  title={commit.sha}
                >
                  <span className="sr-only">Commit </span>
                  {commit.shortSha}
                </Link>
                {showRepo ? null : null}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
