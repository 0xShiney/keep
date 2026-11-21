import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, GitBranch, History } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FileTable } from "@/components/file-table";
import { MarkdownView } from "@/components/markdown-view";
import { RefSwitcher } from "@/components/ref-switcher";
import { RepoHeader } from "@/components/repo-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { assertValidRevision, InvalidRefError } from "@/lib/git/refs";
import { InvalidPathError } from "@/lib/git/path";
import { decodePathSegments } from "@/lib/git/path";
import { formatRelativeTime } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { loadTree } from "@/server/code";
import { listCommitHistory } from "@/server/commits";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · code` };
}

export default async function TreePage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string; path?: string[] }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { owner, repo: repoName, path: rawPath } = await params;
  const { ref: requestedRef } = await searchParams;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/tree`);

  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");

  let path = "";
  try {
    path = decodePathSegments(rawPath);
  } catch (error) {
    if (error instanceof InvalidPathError) notFound();
    throw error;
  }

  const ref = requestedRef ?? repo.defaultBranch;
  try {
    assertValidRevision(ref);
  } catch (error) {
    if (error instanceof InvalidRefError) notFound();
    throw error;
  }

  const [tree, branches, tags, commits] = await Promise.all([
    loadTree(gateway, owner, repoName, ref, path),
    gateway.listBranches(owner, repoName).catch(() => []),
    gateway.listTags(owner, repoName).catch(() => []),
    listCommitHistory(gateway, owner, repoName, {
      ref,
      path: path || undefined,
      page: 1,
      limit: 1,
    }).catch(() => ({ items: [], total: 0, hasMore: false })),
  ]);

  const lastCommit = commits.items[0];
  const encodedRef = encodeURIComponent(ref);

  return (
    <div>
      <RepoHeader repo={repo} active="code" />

      <div className="flex flex-wrap items-center gap-2 pb-3">
        <RefSwitcher
          owner={owner}
          repo={repoName}
          current={ref}
          branches={branches}
          tags={tags}
          mode="tree"
          path={path}
        />
        <Breadcrumbs owner={owner} repo={repoName} gitRef={ref} path={path} mode="tree" />
        <div className="ml-auto flex items-center gap-1">
          <ButtonLink
            href={`/${owner}/${repoName}/commits?ref=${encodedRef}${path ? `&path=${encodeURIComponent(path)}` : ""}`}
            variant="ghost"
            size="sm"
          >
            <History aria-hidden="true" />
            History
          </ButtonLink>
        </div>
      </div>

      {lastCommit ? (
        <div className="border-border bg-surface-2/50 text-2xs text-fg-muted mb-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5">
          <span className="text-fg font-medium">{lastCommit.author.name}</span>
          <Link
            href={`/${owner}/${repoName}/commits/${lastCommit.sha}`}
            className="hover:text-accent min-w-0 truncate hover:underline"
          >
            {lastCommit.summaryLine}
          </Link>
          <Link
            href={`/${owner}/${repoName}/commits/${lastCommit.sha}`}
            className="border-border bg-surface-1 text-fg-subtle hover:text-fg ml-auto shrink-0 rounded-sm border px-1.5 py-px font-mono"
          >
            {lastCommit.shortSha}
          </Link>
          <span className="text-fg-subtle shrink-0">
            {formatRelativeTime(lastCommit.createdAt)}
          </span>
        </div>
      ) : null}

      <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
        {repo.empty ? (
          <EmptyState
            className="border-0"
            title="This repository is empty"
            description={
              <span className="text-2xs font-mono">
                git remote add origin {repo.cloneUrlSsh} && git push -u origin {repo.defaultBranch}
              </span>
            }
            action={
              <ButtonLink href={`/${owner}/${repoName}`} variant="outline" size="sm">
                Repository home
              </ButtonLink>
            }
          />
        ) : (
          <FileTable
            entries={tree.entries}
            owner={owner}
            repo={repoName}
            gitRef={ref}
            path={path}
          />
        )}
      </div>

      {tree.readmeHtml ? (
        <Panel className="mt-4">
          <PanelHeader
            title={
              <span className="flex items-center gap-1.5">
                <BookOpen aria-hidden="true" className="text-fg-subtle size-3.5" />
                {tree.readmeName ?? "README"}
              </span>
            }
          />
          <PanelBody>
            <MarkdownView html={tree.readmeHtml} />
          </PanelBody>
        </Panel>
      ) : null}

      {!repo.empty && tree.entries.length === 0 && path ? (
        <p className="text-2xs text-fg-subtle mt-3 flex items-center gap-1.5">
          <GitBranch aria-hidden="true" className="size-3" />
          Nothing at <span className="font-mono">{path}</span> on{" "}
          <span className="font-mono">{ref}</span>.
        </p>
      ) : null}
    </div>
  );
}
