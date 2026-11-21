import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ExternalLink, GitBranch, Star, Terminal } from "lucide-react";
import { CommitList } from "@/components/commit-list";
import { MarkdownView } from "@/components/markdown-view";
import { RepoHeader } from "@/components/repo-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { assertValidRevision } from "@/lib/git/refs";
import { pluralize } from "@/lib/utils";
import { pageContext, loadRepoForPage } from "@/server/context";
import { loadTree } from "@/server/code";
import { recordRepoAccess } from "@/server/repos";
import { listCommitHistory } from "@/server/commits";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo}` };
}

export default async function RepoOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const { ref: requestedRef } = await searchParams;
  const { identity, viewer, gateway } = await pageContext(`/${owner}/${repoName}`);

  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");

  const ref = requestedRef ?? repo.defaultBranch;
  try {
    assertValidRevision(ref);
  } catch {
    notFound();
  }

  const [tree, branches, tags, languages, commits, releases] = await Promise.all([
    repo.empty
      ? Promise.resolve({ entries: [], readmeHtml: null, readmeName: null })
      : loadTree(gateway, owner, repoName, ref, ""),
    gateway.listBranches(owner, repoName).catch(() => []),
    gateway.listTags(owner, repoName).catch(() => []),
    gateway.getLanguages(owner, repoName).catch(() => ({})),
    listCommitHistory(gateway, owner, repoName, { ref, page: 1, limit: 5 }).catch(() => ({
      items: [],
      total: 0,
      hasMore: false,
    })),
    gateway.listReleases(owner, repoName).catch(() => []),
  ]);

  await recordRepoAccess(identity.userId, repo.fullName);

  const languageTotal = Object.values(languages).reduce((sum, value) => sum + value, 0);
  const languageEntries = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const latestRelease = releases.find((release) => !release.draft);
  const visibleEntries = tree.entries.slice(0, 12);

  return (
    <div>
      <RepoHeader repo={repo} active="code" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-3">
          {repo.empty ? (
            <Panel>
              <PanelHeader title="This repository is empty" />
              <PanelBody className="flex flex-col gap-3">
                <p className="text-fg-muted text-xs">
                  Push an existing project, or create a first file, using one of these remotes:
                </p>
                <div className="flex flex-col gap-2">
                  <code className="border-border bg-bg text-2xs text-fg-muted overflow-x-auto rounded-sm border px-2 py-1.5 font-mono whitespace-nowrap">
                    git remote add origin {repo.cloneUrlSsh}
                  </code>
                  <code className="border-border bg-bg text-2xs text-fg-muted overflow-x-auto rounded-sm border px-2 py-1.5 font-mono whitespace-nowrap">
                    git push -u origin {repo.defaultBranch}
                  </code>
                </div>
                <p className="text-2xs text-fg-subtle flex items-center gap-1.5">
                  <Terminal aria-hidden="true" className="size-3.5" /> SSH keys are managed under
                  Settings → SSH keys.
                </p>
              </PanelBody>
            </Panel>
          ) : (
            <>
              <div className="border-border bg-surface-2/60 flex flex-wrap items-center justify-between gap-2 rounded-t-md border border-b-0 px-3 py-1.5">
                <div className="text-fg-muted flex items-center gap-2 text-xs">
                  <GitBranch aria-hidden="true" className="text-fg-subtle size-3.5" />
                  <span className="font-mono">{ref}</span>
                  {branches.length > 0 ? (
                    <span className="text-fg-subtle">
                      · {pluralize(branches.length, "branch", "branches")}
                    </span>
                  ) : null}
                </div>
                <Link
                  href={`/${owner}/${repoName}/tree/${encodeURIComponent(ref)}`}
                  className="text-accent text-xs hover:underline"
                >
                  Browse files →
                </Link>
              </div>
              <div className="border-border bg-surface-1 overflow-hidden rounded-b-md border">
                <ul className="divide-border divide-y">
                  {visibleEntries.map((entry) => (
                    <li key={entry.path} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <span aria-hidden="true" className="text-fg-subtle">
                        {entry.type === "dir" ? "▸" : "·"}
                      </span>
                      <Link
                        href={
                          entry.type === "dir"
                            ? `/${owner}/${repoName}/tree/${encodeURIComponent(ref)}/${entry.path
                                .split("/")
                                .map(encodeURIComponent)
                                .join("/")}`
                            : `/${owner}/${repoName}/blob/${encodeURIComponent(ref)}/${entry.path
                                .split("/")
                                .map(encodeURIComponent)
                                .join("/")}`
                        }
                        className="text-fg hover:text-accent min-w-0 flex-1 truncate hover:underline"
                      >
                        {entry.name}
                        {entry.type === "dir" ? "/" : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
                {tree.entries.length > visibleEntries.length ? (
                  <div className="border-border border-t px-3 py-1.5">
                    <Link
                      href={`/${owner}/${repoName}/tree/${encodeURIComponent(ref)}`}
                      className="text-2xs text-accent hover:underline"
                    >
                      View all {tree.entries.length} entries
                    </Link>
                  </div>
                ) : null}
              </div>

              {tree.readmeHtml ? (
                <Panel>
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

              <Panel>
                <PanelHeader
                  title="Recent commits"
                  action={
                    <Link
                      href={`/${owner}/${repoName}/commits`}
                      className="text-2xs text-accent hover:underline"
                    >
                      All commits
                    </Link>
                  }
                />
                <CommitList commits={commits.items} owner={owner} repo={repoName} />
              </Panel>
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <Panel>
            <PanelHeader title="About" />
            <PanelBody className="flex flex-col gap-2.5 text-xs">
              <p className="text-fg-muted">{repo.description || "No description provided."}</p>
              {repo.website ? (
                <a
                  href={repo.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-accent flex items-center gap-1 hover:underline"
                >
                  <ExternalLink aria-hidden="true" className="size-3" />
                  {repo.website}
                </a>
              ) : null}
              {repo.topics.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {repo.topics.map((topic) => (
                    <Badge key={topic} tone="accent">
                      {topic}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <dl className="border-border text-2xs text-fg-subtle flex flex-col gap-1 border-t pt-2">
                <div className="flex items-center gap-1.5">
                  <Star aria-hidden="true" className="size-3" />
                  <dt className="sr-only">Stars</dt>
                  <dd>{pluralize(repo.stars, "star")}</dd>
                </div>
                <div>
                  <dt className="sr-only">Forks</dt>
                  <dd>{pluralize(repo.forks, "fork")}</dd>
                </div>
                <div>
                  <dt className="sr-only">Default branch</dt>
                  <dd className="font-mono">{repo.defaultBranch}</dd>
                </div>
              </dl>
            </PanelBody>
          </Panel>

          {latestRelease ? (
            <Panel>
              <PanelHeader title="Latest release" />
              <PanelBody className="text-xs">
                <Link
                  href={`/${owner}/${repoName}/releases`}
                  className="text-accent font-medium hover:underline"
                >
                  {latestRelease.name || latestRelease.tagName}
                </Link>
                <p className="text-2xs text-fg-subtle mt-0.5 font-mono">{latestRelease.tagName}</p>
              </PanelBody>
            </Panel>
          ) : null}

          {languageEntries.length > 0 ? (
            <Panel>
              <PanelHeader title="Languages" />
              <PanelBody className="flex flex-col gap-2">
                <div className="bg-surface-2 flex h-1.5 overflow-hidden rounded-full">
                  {languageEntries.map(([language, value], index) => (
                    <span
                      key={language}
                      title={`${language}: ${Math.round((value / Math.max(languageTotal, 1)) * 100)}%`}
                      style={{
                        width: `${Math.max(2, Math.round((value / Math.max(languageTotal, 1)) * 100))}%`,
                        opacity: 1 - index * 0.15,
                      }}
                      className="bg-accent"
                    />
                  ))}
                </div>
                <ul className="text-2xs text-fg-muted flex flex-col gap-1">
                  {languageEntries.map(([language, value]) => (
                    <li key={language} className="flex items-center justify-between gap-2">
                      <span>{language}</span>
                      <span className="text-fg-subtle">
                        {Math.round((value / Math.max(languageTotal, 1)) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          ) : null}

          {tags.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Tags"
                action={
                  <Link
                    href={`/${owner}/${repoName}/tags`}
                    className="text-2xs text-accent hover:underline"
                  >
                    All
                  </Link>
                }
              />
              <PanelBody className="flex flex-wrap gap-1">
                {tags.slice(0, 6).map((tag) => (
                  <Link
                    key={tag.name}
                    href={`/${owner}/${repoName}/tree/${encodeURIComponent(tag.name)}`}
                    className="border-border bg-surface-2 text-2xs text-fg-muted hover:text-fg rounded-sm border px-1.5 py-0.5 font-mono"
                  >
                    {tag.name}
                  </Link>
                ))}
              </PanelBody>
            </Panel>
          ) : null}

          {commits.total === 0 && !repo.empty ? (
            <EmptyState
              title="No commits"
              description="This repository has no commit history yet."
            />
          ) : null}

          <ButtonLink href={`/${owner}/${repoName}/settings`} variant="outline" size="sm">
            Repository settings
          </ButtonLink>
        </aside>
      </div>
    </div>
  );
}
