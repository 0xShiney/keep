import type { Metadata } from "next";
import Link from "next/link";
import { Package, Tag } from "lucide-react";
import { ReleaseForm } from "@/components/forms/release-form";
import { MarkdownView } from "@/components/markdown-view";
import { RepoHeader } from "@/components/repo-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { renderMarkdown } from "@/lib/render/markdown";
import { formatBytes, formatDate } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · releases` };
}

export default async function ReleasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ tag?: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const { tag: requestedTag } = await searchParams;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/releases`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "release:read");
  const releases = await gateway.listReleases(owner, repoName);

  const rendered = await Promise.all(
    releases.map(async (release) => ({
      release,
      html: release.body
        ? await renderMarkdown(release.body, {
            linkBase: `/${owner}/${repoName}/blob/${encodeURIComponent(release.tagName)}`,
            rawBase: `/${owner}/${repoName}/raw/${encodeURIComponent(release.tagName)}`,
          })
        : null,
    })),
  );

  return (
    <div>
      <RepoHeader repo={repo} active="releases" />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-fg flex items-center gap-1.5 text-sm font-semibold">
          <Tag aria-hidden="true" className="text-fg-subtle size-3.5" />
          Releases <span className="text-fg-subtle">({releases.length})</span>
        </h2>
        <ReleaseForm owner={owner} repo={repoName} defaultTag={requestedTag ?? ""} />
      </div>

      {rendered.length === 0 ? (
        <EmptyState
          title="No releases yet"
          description="A release pairs a git tag with notes and optional downloadable assets."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rendered.map(({ release, html }) => (
            <article
              key={release.id}
              className="border-border bg-surface-1 overflow-hidden rounded-md border"
            >
              <header className="border-border bg-surface-2/50 flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <Package aria-hidden="true" className="text-fg-subtle size-3.5" />
                <h3 className="text-fg text-sm font-semibold">{release.name || release.tagName}</h3>
                <span className="border-border bg-surface-1 text-2xs text-fg-muted rounded-sm border px-1.5 py-0.5 font-mono">
                  {release.tagName}
                </span>
                {release.prerelease ? <Badge tone="warning">pre-release</Badge> : null}
                <span className="text-2xs text-fg-subtle ml-auto">
                  {formatDate(release.publishedAt ?? release.createdAt)}
                </span>
              </header>
              <div className="px-3 py-3">
                {html ? (
                  <MarkdownView html={html} />
                ) : (
                  <p className="text-fg-subtle text-xs">No release notes.</p>
                )}

                <div className="border-border mt-3 border-t pt-2">
                  <p className="text-2xs text-fg-subtle mb-1 font-medium tracking-wider uppercase">
                    Assets
                  </p>
                  {release.assets.length === 0 ? (
                    <p className="text-2xs text-fg-subtle">
                      No uploaded assets. Source archives are available from the tag:
                      <Link
                        href={`/${owner}/${repoName}/tags`}
                        className="text-accent ml-1 underline underline-offset-2"
                      >
                        view tags
                      </Link>
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {release.assets.map((asset) => (
                        <li
                          key={asset.id}
                          className="border-border bg-bg text-2xs flex items-center gap-2 rounded-sm border px-2 py-1"
                        >
                          <Package aria-hidden="true" className="text-fg-subtle size-3" />
                          <a
                            href={asset.browserDownloadUrl ?? "#"}
                            className="text-accent min-w-0 flex-1 truncate hover:underline"
                          >
                            {asset.name}
                          </a>
                          <span className="text-fg-subtle">{formatBytes(asset.size)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
