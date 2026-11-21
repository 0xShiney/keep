import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDot, CircleSlash, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { IssueCommentForm, IssueStateButton } from "@/components/forms/issue-forms";
import { LabelChip } from "@/components/labels";
import { MarkdownView } from "@/components/markdown-view";
import { RepoHeader } from "@/components/repo-header";
import { Badge } from "@/components/ui/badge";
import { ForgejoApiError } from "@/lib/forgejo/client";
import { renderMarkdown } from "@/lib/render/markdown";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { loadIssue } from "@/server/issues";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}): Promise<Metadata> {
  const { owner, repo, number } = await params;
  return { title: `${owner}/${repo}#${number}` };
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const { owner, repo: repoName, number: rawNumber } = await params;
  const number = Number.parseInt(rawNumber, 10);
  if (!Number.isInteger(number) || number < 1) notFound();

  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/issues/${number}`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "issue:read");

  let issue;
  try {
    issue = await loadIssue(gateway, owner, repoName, number);
  } catch (error) {
    if (error instanceof ForgejoApiError && error.status === 404) notFound();
    throw error;
  }

  const linkBase = `/${owner}/${repoName}/blob/${encodeURIComponent(repo.defaultBranch)}`;
  const rawBase = `/${owner}/${repoName}/raw/${encodeURIComponent(repo.defaultBranch)}`;
  const [bodyHtml, commentHtml] = await Promise.all([
    issue.body ? renderMarkdown(issue.body, { linkBase, rawBase }) : Promise.resolve(null),
    Promise.all(
      issue.timeline
        .filter((entry) => entry.body)
        .map(async (entry) => ({
          entry,
          html: await renderMarkdown(entry.body ?? "", { linkBase, rawBase }),
        })),
    ),
  ]);

  return (
    <div>
      <RepoHeader
        repo={repo}
        active="issues"
        counts={{ issues: repo.openIssues, pulls: repo.openPulls }}
      />

      <div className="mb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-fg text-lg font-semibold">
              {issue.title} <span className="text-fg-subtle font-normal">#{issue.number}</span>
            </h1>
            <div className="text-2xs text-fg-subtle mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={issue.state === "open" ? "success" : "accent"}>
                {issue.state === "open" ? (
                  <CircleDot aria-hidden="true" className="size-2.5" />
                ) : (
                  <CircleSlash aria-hidden="true" className="size-2.5" />
                )}
                {issue.state === "open" ? "Open" : "Closed"}
              </Badge>
              <span>
                {issue.author.login} opened this {formatRelativeTime(issue.createdAt)}
              </span>
              <span>· {issue.comments} comments</span>
            </div>
          </div>
          <IssueStateButton
            owner={owner}
            repo={repoName}
            number={issue.number}
            state={issue.state}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-3">
          <article className="border-border bg-surface-1 overflow-hidden rounded-md border">
            <div className="border-border bg-surface-2/60 text-2xs text-fg-subtle flex items-center gap-2 border-b px-3 py-1.5">
              <Avatar name={issue.author.login} src={issue.author.avatarUrl} size={16} />
              <span className="text-fg-muted font-medium">{issue.author.login}</span>
              <span>commented {formatDateTime(issue.createdAt)}</span>
            </div>
            <div className="px-4 py-3">
              {bodyHtml ? (
                <MarkdownView html={bodyHtml} />
              ) : (
                <p className="text-fg-subtle text-xs">No description provided.</p>
              )}
            </div>
          </article>

          {commentHtml.map(({ entry, html }) => (
            <article
              key={entry.id}
              className="border-border bg-surface-1 overflow-hidden rounded-md border"
            >
              <div className="border-border bg-surface-2/60 text-2xs text-fg-subtle flex items-center gap-2 border-b px-3 py-1.5">
                <MessageSquare aria-hidden="true" className="size-3" />
                <span className="text-fg-muted font-medium">
                  {entry.author?.login ?? "unknown"}
                </span>
                <span>{formatDateTime(entry.createdAt)}</span>
              </div>
              <div className="px-4 py-3">
                <MarkdownView html={html} />
              </div>
            </article>
          ))}

          <div className="border-border bg-surface-1 rounded-md border p-3">
            <IssueCommentForm owner={owner} repo={repoName} number={issue.number} />
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="border-border bg-surface-1 rounded-md border p-3 text-xs">
            <p className="text-2xs text-fg-subtle mb-1.5 font-medium tracking-wider uppercase">
              Labels
            </p>
            {issue.labels.length === 0 ? (
              <p className="text-fg-subtle">None</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((label) => (
                  <LabelChip key={label.id} label={label} />
                ))}
              </div>
            )}
            <p className="text-2xs text-fg-subtle mt-3 mb-1.5 font-medium tracking-wider uppercase">
              Milestone
            </p>
            <p className="text-fg-muted">{issue.milestone?.title ?? "None"}</p>
            <p className="text-2xs text-fg-subtle mt-3 mb-1.5 font-medium tracking-wider uppercase">
              Assignees
            </p>
            <p className="text-fg-muted">
              {issue.assignees.length > 0 ? issue.assignees.map((a) => a.login).join(", ") : "None"}
            </p>
          </div>
          <Link
            href={`/${owner}/${repoName}/issues`}
            className="text-2xs text-fg-subtle hover:text-fg-muted underline underline-offset-2"
          >
            ← All issues
          </Link>
        </aside>
      </div>
    </div>
  );
}
