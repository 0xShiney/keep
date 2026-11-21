import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleCheck, CircleAlert } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { DiffView } from "@/components/diff-view";
import { RepoHeader } from "@/components/repo-header";
import { Avatar } from "@/components/avatar";
import { ButtonLink } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/feedback";
import { ForgejoApiError } from "@/lib/forgejo/client";
import { isCommitSha, assertValidRevision, InvalidRefError } from "@/lib/git/refs";
import { buildQueryString, formatDateTime, pluralize } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { loadCommit } from "@/server/commits";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string; sha: string }>;
}): Promise<Metadata> {
  const { owner, repo, sha } = await params;
  return { title: `${sha.slice(0, 7)} · ${owner}/${repo}` };
}

export default async function CommitPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string; sha: string }>;
  searchParams: Promise<{ mode?: string; expand?: string }>;
}) {
  const { owner, repo: repoName, sha: rawSha } = await params;
  const query = await searchParams;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/commits/${rawSha}`);

  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");

  try {
    assertValidRevision(rawSha);
  } catch (error) {
    if (error instanceof InvalidRefError) notFound();
    throw error;
  }

  let view;
  try {
    view = await loadCommit(gateway, owner, repoName, rawSha);
  } catch (error) {
    if (error instanceof ForgejoApiError && error.status === 404) notFound();
    throw error;
  }

  const { detail, diff, diffFailed } = view;
  const mode = query.mode === "split" ? "split" : "unified";
  const baseHref = `/${owner}/${repoName}/commits/${detail.sha}${buildQueryString({ mode: mode === "split" ? "split" : undefined })}`;

  return (
    <div>
      <RepoHeader repo={repo} active="code" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ButtonLink href={`/${owner}/${repoName}/commits`} variant="ghost" size="sm">
          <ChevronLeft aria-hidden="true" />
          All commits
        </ButtonLink>
        <span className="ml-auto flex items-center gap-1">
          <ButtonLink
            href={`/${owner}/${repoName}/commits/${detail.sha}${buildQueryString({ expand: query.expand, mode: mode === "unified" ? "split" : undefined })}`}
            variant={mode === "split" ? "secondary" : "outline"}
            size="sm"
          >
            {mode === "split" ? "Split new" : "Unified"}
          </ButtonLink>
          <ButtonLink
            href={`/${owner}/${repoName}/commits/${detail.sha}${buildQueryString({ mode: "split", expand: query.expand })}`}
            variant={mode === "split" ? "primary" : "outline"}
            size="sm"
          >
            Split
          </ButtonLink>
        </span>
      </div>

      <div className="border-border bg-surface-1 mb-3 overflow-hidden rounded-md border">
        <div className="border-border border-b px-3 py-2.5">
          <h1 className="text-fg text-sm font-semibold break-words whitespace-pre-wrap">
            {detail.message || "(no commit message)"}
          </h1>
          <div className="text-2xs text-fg-subtle mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <Avatar name={detail.author.name} src={detail.author.avatarUrl} size={16} />
              <span className="text-fg-muted font-medium">{detail.author.name}</span>
              {detail.author.email ? <span>&lt;{detail.author.email}&gt;</span> : null}
            </span>
            <span>authored {formatDateTime(detail.author.date)}</span>
            {detail.committer ? (
              <span>committed {formatDateTime(detail.committer.date)}</span>
            ) : null}
            {detail.verification ? (
              <span
                className={
                  detail.verification.verified
                    ? "text-success flex items-center gap-1"
                    : "text-fg-subtle flex items-center gap-1"
                }
                title={detail.verification.reason ?? undefined}
              >
                {detail.verification.verified ? (
                  <CircleCheck aria-hidden="true" className="size-3" />
                ) : (
                  <CircleAlert aria-hidden="true" className="size-3" />
                )}
                {detail.verification.verified ? "verified" : "unverified"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-2xs flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="text-fg-subtle">commit</span>
          <code className="text-fg-muted font-mono">{detail.sha}</code>
          <CopyButton value={detail.sha} label="Copy commit SHA" />
          {detail.parents.length > 0 ? (
            <span className="text-fg-subtle flex flex-wrap items-center gap-1.5">
              parent{detail.parents.length > 1 ? "s" : ""}
              {detail.parents.map((parent) => (
                <Link
                  key={parent}
                  href={`/${owner}/${repoName}/commits/${parent}`}
                  className="border-border bg-surface-2 text-fg-muted hover:text-fg rounded-sm border px-1.5 py-px font-mono"
                >
                  {parent.slice(0, 7)}
                </Link>
              ))}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-2 font-mono">
            <span className="text-success">+{detail.stats.additions}</span>
            <span className="text-danger">-{detail.stats.deletions}</span>
            <span className="text-fg-subtle">{pluralize(detail.files.length, "file")}</span>
          </span>
        </div>
      </div>

      {diffFailed ? (
        <InlineNotice tone="warning" className="mb-3">
          The diff for this commit could not be loaded. The commit metadata above is still accurate.
        </InlineNotice>
      ) : null}

      <DiffView
        files={diff?.files ?? []}
        mode={mode}
        expandPath={query.expand}
        baseHref={baseHref}
        truncated={Boolean(diff?.truncated)}
      />

      {diff && diff.files.length > 0 ? (
        <p className="text-2xs text-fg-subtle mt-2">
          {isCommitSha(detail.sha) ? "Parsed server-side from Forgejo's unified diff." : ""}
        </p>
      ) : null}
    </div>
  );
}
