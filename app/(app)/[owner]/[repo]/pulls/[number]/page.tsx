import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitMerge, GitPullRequest, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { DiffView } from "@/components/diff-view";
import { MergeBox, ReviewBar } from "@/components/forms/pull-forms";
import { MarkdownView } from "@/components/markdown-view";
import { RepoHeader } from "@/components/repo-header";
import { Badge } from "@/components/ui/badge";
import { ForgejoApiError } from "@/lib/forgejo/client";
import { renderMarkdown } from "@/lib/render/markdown";
import { buildQueryString, cn, formatDateTime, pluralize } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { loadPull, pullStatus } from "@/server/pulls";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}): Promise<Metadata> {
  const { owner, repo, number } = await params;
  return { title: `${owner}/${repo} PR #${number}` };
}

const TABS = [
  { key: "conversation", label: "Conversation" },
  { key: "commits", label: "Commits" },
  { key: "files", label: "Files changed" },
] as const;

export default async function PullDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
  searchParams: Promise<{ tab?: string; mode?: string; expand?: string }>;
}) {
  const { owner, repo: repoName, number: rawNumber } = await params;
  const query = await searchParams;
  const number = Number.parseInt(rawNumber, 10);
  if (!Number.isInteger(number) || number < 1) notFound();

  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/pulls/${number}`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "pull:read");

  let view;
  try {
    view = await loadPull(gateway, owner, repoName, number);
  } catch (error) {
    if (error instanceof ForgejoApiError && error.status === 404) notFound();
    throw error;
  }

  const { pull, diff, stats } = view;
  const status = pullStatus(pull);
  const tab = query.tab === "commits" || query.tab === "files" ? query.tab : "conversation";
  const mode = query.mode === "split" ? "split" : "unified";
  const baseHref = `/${owner}/${repoName}/pulls/${number}${buildQueryString({
    tab: "files",
    mode: mode === "split" ? "split" : undefined,
  })}`;

  const linkBase = `/${owner}/${repoName}/blob/${encodeURIComponent(pull.headRef)}`;
  const rawBase = `/${owner}/${repoName}/raw/${encodeURIComponent(pull.headRef)}`;
  const bodyHtml = pull.body ? await renderMarkdown(pull.body, { linkBase, rawBase }) : null;

  return (
    <div>
      <RepoHeader
        repo={repo}
        active="pulls"
        counts={{ issues: repo.openIssues, pulls: repo.openPulls }}
      />

      <div className="mb-3">
        <h1 className="text-fg text-lg font-semibold">
          {pull.title} <span className="text-fg-subtle font-normal">#{pull.number}</span>
        </h1>
        <div className="text-2xs text-fg-subtle mt-1 flex flex-wrap items-center gap-2">
          <Badge
            tone={
              status === "merged"
                ? "accent"
                : status === "closed"
                  ? "neutral"
                  : status === "draft"
                    ? "neutral"
                    : "success"
            }
          >
            {status === "merged" ? (
              <GitMerge aria-hidden="true" className="size-2.5" />
            ) : (
              <GitPullRequest aria-hidden="true" className="size-2.5" />
            )}
            {status}
          </Badge>
          <span>
            <span className="text-fg-muted font-mono">{pull.headRef}</span> →{" "}
            <span className="text-fg-muted font-mono">{pull.baseRef}</span>
          </span>
          <span>
            · {pull.author.login} wants to merge {pluralize(pull.commits.length, "commit")}
          </span>
          <span>
            · <span className="text-success">+{stats.additions}</span>{" "}
            <span className="text-danger">-{stats.deletions}</span> in{" "}
            {pluralize(stats.files, "file")}
          </span>
        </div>
      </div>

      <nav
        aria-label="Pull request sections"
        className="border-border -mb-px mb-3 flex gap-1 border-b"
      >
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/${owner}/${repoName}/pulls/${number}${buildQueryString({ tab: item.key === "conversation" ? undefined : item.key })}`}
            aria-current={tab === item.key ? "page" : undefined}
            className={cn(
              "border-b-2 px-2.5 py-2 text-xs",
              tab === item.key
                ? "border-accent text-fg font-medium"
                : "text-fg-muted hover:border-border-strong hover:text-fg border-transparent",
            )}
          >
            {item.label}
            {item.key === "commits" ? ` (${pull.commits.length})` : ""}
            {item.key === "files" ? ` (${stats.files})` : ""}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {tab === "conversation" ? (
            <div className="flex flex-col gap-3">
              <article className="border-border bg-surface-1 overflow-hidden rounded-md border">
                <div className="border-border bg-surface-2/60 text-2xs text-fg-subtle flex items-center gap-2 border-b px-3 py-1.5">
                  <Avatar name={pull.author.login} src={pull.author.avatarUrl} size={16} />
                  <span className="text-fg-muted font-medium">{pull.author.login}</span>
                  <span>opened {formatDateTime(pull.createdAt)}</span>
                </div>
                <div className="px-4 py-3">
                  {bodyHtml ? (
                    <MarkdownView html={bodyHtml} />
                  ) : (
                    <p className="text-fg-subtle text-xs">No description provided.</p>
                  )}
                </div>
              </article>

              {pull.reviews.length === 0 ? (
                <p className="border-border text-fg-subtle rounded-md border border-dashed px-3 py-3 text-xs">
                  No reviews yet. Use the Files changed tab to review and comment.
                </p>
              ) : (
                pull.reviews.map((review) => (
                  <article
                    key={review.id}
                    className="border-border bg-surface-1 overflow-hidden rounded-md border"
                  >
                    <div className="border-border bg-surface-2/60 text-2xs text-fg-subtle flex items-center gap-2 border-b px-3 py-1.5">
                      <Avatar name={review.author.login} src={review.author.avatarUrl} size={16} />
                      <span className="text-fg-muted font-medium">{review.author.login}</span>
                      <Badge tone={review.state === "APPROVED" ? "success" : "warning"}>
                        {review.state.toLowerCase().replace("_", " ")}
                      </Badge>
                      <span>{review.submittedAt ? formatDateTime(review.submittedAt) : ""}</span>
                    </div>
                    <div className="text-fg-muted px-4 py-2 text-xs">
                      {review.body ? (
                        <p className="whitespace-pre-wrap">{review.body}</p>
                      ) : (
                        <p className="text-fg-subtle">No summary.</p>
                      )}
                      {review.comments.length > 0 ? (
                        <ul className="mt-2 flex flex-col gap-1">
                          {review.comments.map((comment) => (
                            <li
                              key={comment.id}
                              className="border-border bg-bg text-2xs rounded-sm border px-2 py-1 font-mono"
                            >
                              <span className="text-fg-subtle">{comment.path}</span>
                              <span className="text-fg-muted ml-1">{comment.body}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </article>
                ))
              )}

              <ReviewBar
                owner={owner}
                repo={repoName}
                number={number}
                files={diff?.files.map((file) => file.path) ?? []}
              />
            </div>
          ) : tab === "commits" ? (
            <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
              <ul className="divide-border divide-y">
                {pull.commits.map((commit) => (
                  <li key={commit.sha} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-fg min-w-0 flex-1 truncate text-xs">
                      {commit.summaryLine}
                    </span>
                    <span className="text-2xs text-fg-subtle">{commit.author.name}</span>
                    <Link
                      href={`/${owner}/${repoName}/commits/${commit.sha}`}
                      className="border-border bg-surface-2 text-2xs text-fg-muted hover:text-fg rounded-sm border px-1.5 py-px font-mono"
                    >
                      {commit.shortSha}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Link
                  href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}mode=${mode === "split" ? "unified" : "split"}`}
                  className="border-border bg-surface-1 text-2xs text-fg-muted hover:text-fg rounded-sm border px-2 py-1"
                >
                  {mode === "split" ? "Unified view" : "Split view"}
                </Link>
                <span className="text-2xs text-fg-subtle">
                  <MessageSquare aria-hidden="true" className="mr-1 inline size-3" />
                  {pull.reviewComments} review comments
                </span>
              </div>
              <DiffView
                files={diff?.files ?? []}
                mode={mode}
                expandPath={query.expand}
                baseHref={baseHref}
                truncated={view.truncated}
              />
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          {tab === "files" && !pull.merged ? (
            <ReviewBar
              owner={owner}
              repo={repoName}
              number={number}
              files={diff?.files.map((file) => file.path) ?? []}
            />
          ) : null}
          <MergeBox
            owner={owner}
            repo={repoName}
            number={number}
            mergeable={pull.mergeable}
            merged={pull.merged}
          />
        </aside>
      </div>
    </div>
  );
}
