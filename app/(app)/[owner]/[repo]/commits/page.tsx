import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { CommitList } from "@/components/commit-list";
import { Pagination } from "@/components/pagination";
import { RefSwitcher } from "@/components/ref-switcher";
import { RepoHeader } from "@/components/repo-header";
import { EmptyState } from "@/components/ui/feedback";
import { assertValidRevision, InvalidRefError } from "@/lib/git/refs";
import { normalizeRepoPath, InvalidPathError } from "@/lib/git/path";
import { buildQueryString, pluralize } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { listCommitHistory } from "@/server/commits";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · commits` };
}

export default async function CommitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ ref?: string; path?: string; page?: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const query = await searchParams;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/commits`);

  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");

  const ref = query.ref ?? repo.defaultBranch;
  try {
    assertValidRevision(ref);
  } catch (error) {
    if (error instanceof InvalidRefError) notFound();
    throw error;
  }

  let path = "";
  try {
    path = normalizeRepoPath(query.path ?? "");
  } catch (error) {
    if (error instanceof InvalidPathError) notFound();
    throw error;
  }

  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const [commits, branches, tags] = await Promise.all([
    listCommitHistory(gateway, owner, repoName, { ref, path: path || undefined, page }),
    gateway.listBranches(owner, repoName).catch(() => []),
    gateway.listTags(owner, repoName).catch(() => []),
  ]);

  return (
    <div>
      <RepoHeader repo={repo} active="code" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RefSwitcher
          owner={owner}
          repo={repoName}
          current={ref}
          branches={branches}
          tags={tags}
          mode="commits"
        />
        {path ? (
          <span className="text-fg-subtle flex items-center gap-1 text-xs">
            <History aria-hidden="true" className="size-3.5" />
            History for <span className="text-fg-muted font-mono">{path}</span>
            <Link
              href={`/${owner}/${repoName}/commits?ref=${encodeURIComponent(ref)}`}
              className="text-accent ml-1 hover:underline"
            >
              clear
            </Link>
          </span>
        ) : null}
        <span className="text-2xs text-fg-subtle ml-auto">
          {pluralize(commits.total, "commit")}
        </span>
      </div>

      <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
        {commits.items.length === 0 ? (
          <EmptyState
            className="border-0"
            title="No commits"
            description={
              repo.empty
                ? "Push to this repository to create history."
                : "No commits match this ref or path."
            }
          />
        ) : (
          <CommitList commits={commits.items} owner={owner} repo={repoName} />
        )}
      </div>

      <div className="mt-3">
        <Pagination
          page={page}
          hasMore={commits.hasMore}
          label="commits"
          buildHref={(next) =>
            `/${owner}/${repoName}/commits${buildQueryString({
              ref,
              path: path || undefined,
              page: next > 1 ? next : undefined,
            })}`
          }
        />
      </div>
    </div>
  );
}
