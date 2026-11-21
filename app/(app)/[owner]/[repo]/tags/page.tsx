import type { Metadata } from "next";
import Link from "next/link";
import { Download, Tag } from "lucide-react";
import { TagForm } from "@/components/forms/tag-form";
import { RepoHeader } from "@/components/repo-header";
import { EmptyState } from "@/components/ui/feedback";
import { formatRelativeTime } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · tags` };
}

export default async function TagsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/tags`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");
  const tags = await gateway.listTags(owner, repoName);

  return (
    <div>
      <RepoHeader repo={repo} active="code" />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-fg flex items-center gap-1.5 text-sm font-semibold">
          <Tag aria-hidden="true" className="text-fg-subtle size-3.5" />
          Tags <span className="text-fg-subtle">({tags.length})</span>
        </h2>
        <TagForm owner={owner} repo={repoName} defaultTarget={repo.defaultBranch} />
      </div>

      <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
        {tags.length === 0 ? (
          <EmptyState
            className="border-0"
            title="No tags yet"
            description="Tags mark releases. Create one here or push one with git."
          />
        ) : (
          <ul className="divide-border divide-y">
            {tags.map((tag) => (
              <li key={tag.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Link
                  href={`/${owner}/${repoName}/tree/${encodeURIComponent(tag.name)}`}
                  className="text-accent font-mono text-xs hover:underline"
                >
                  {tag.name}
                </Link>
                {tag.message ? (
                  <span className="text-2xs text-fg-subtle min-w-0 flex-1 truncate">
                    {tag.message}
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                <span className="text-2xs text-fg-subtle">
                  {tag.date ? formatRelativeTime(tag.date) : ""}
                </span>
                <span className="text-2xs text-fg-subtle flex items-center gap-1">
                  <Download aria-hidden="true" className="size-3" />
                  {tag.downloadCount}
                </span>
                <Link
                  href={`/${owner}/${repoName}/commits/${tag.sha}`}
                  className="border-border bg-surface-2 text-2xs text-fg-muted hover:text-fg rounded-sm border px-1.5 py-px font-mono"
                >
                  {tag.sha.slice(0, 7)}
                </Link>
                <Link
                  href={`/${owner}/${repoName}/releases?tag=${encodeURIComponent(tag.name)}`}
                  className="text-2xs text-accent hover:underline"
                >
                  release
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
