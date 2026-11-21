import type { Metadata } from "next";
import Link from "next/link";
import { CircleDot, CircleSlash, MessageSquare } from "lucide-react";
import { IssueComposer } from "@/components/forms/issue-forms";
import { LabelList } from "@/components/labels";
import { Pagination } from "@/components/pagination";
import { RepoHeader } from "@/components/repo-header";
import { EmptyState } from "@/components/ui/feedback";
import { buildQueryString, cn, formatRelativeTime, pluralize } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { listIssues } from "@/server/issues";
import { ButtonLink } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · issues` };
}

const STATES = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ state?: string; q?: string; label?: string; page?: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const query = await searchParams;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/issues`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "issue:read");

  const state = query.state === "closed" || query.state === "all" ? query.state : "open";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const q = query.q?.trim() ?? "";

  const issues = await listIssues(gateway, owner, repoName, {
    state,
    query: q || undefined,
    label: query.label,
    page,
    limit: 25,
  });

  return (
    <div>
      <RepoHeader
        repo={repo}
        active="issues"
        counts={{ issues: repo.openIssues, pulls: repo.openPulls }}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Filter by state">
          {STATES.map((item) => (
            <Link
              key={item.value}
              href={`/${owner}/${repoName}/issues${buildQueryString({
                state: item.value === "open" ? undefined : item.value,
                q: q || undefined,
                label: query.label,
              })}`}
              aria-current={state === item.value ? "true" : undefined}
              className={cn(
                "rounded-sm px-2 py-1 text-xs",
                state === item.value
                  ? "bg-surface-2 text-fg font-medium"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <form action={`/${owner}/${repoName}/issues`} className="ml-auto flex items-center gap-1">
          <input type="hidden" name="state" value={state === "open" ? "" : state} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            data-search-input
            placeholder="Search issues…"
            aria-label="Search issues"
            className="border-border bg-surface-1 text-fg placeholder:text-fg-subtle focus-visible:border-ring focus-visible:outline-ring h-8 w-48 rounded-sm border px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-1"
          />
        </form>

        <IssueComposer owner={owner} repo={repoName} />
      </div>

      <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
        {issues.items.length === 0 ? (
          <EmptyState
            className="border-0"
            title={q ? "No issues match that search" : `No ${state === "all" ? "" : state} issues`}
            description={
              q ? "Try a different search term." : "Open an issue to track work on this repository."
            }
            action={
              q ? (
                <ButtonLink href={`/${owner}/${repoName}/issues`} variant="outline" size="sm">
                  Clear search
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {issues.items.map((issue) => (
              <li key={issue.id} className="hover:bg-surface-2 flex items-start gap-2 px-3 py-2">
                {issue.state === "open" ? (
                  <CircleDot aria-hidden="true" className="text-success mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <CircleSlash
                    aria-hidden="true"
                    className="text-status-closed mt-0.5 size-3.5 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/${owner}/${repoName}/issues/${issue.number}`}
                      className="text-fg hover:text-accent text-xs font-medium hover:underline"
                    >
                      {issue.title}
                    </Link>
                    <LabelList labels={issue.labels} />
                  </div>
                  <p className="text-2xs text-fg-subtle mt-0.5">
                    #{issue.number} opened {formatRelativeTime(issue.createdAt)} by{" "}
                    {issue.author.login}
                  </p>
                </div>
                {issue.comments > 0 ? (
                  <span className="text-2xs text-fg-subtle flex items-center gap-1">
                    <MessageSquare aria-hidden="true" className="size-3" />
                    {issue.comments}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-2xs text-fg-subtle">{pluralize(issues.total, "issue")}</span>
        <Pagination
          page={page}
          hasMore={issues.hasMore}
          label="issues"
          buildHref={(next) =>
            `/${owner}/${repoName}/issues${buildQueryString({
              state: state === "open" ? undefined : state,
              q: q || undefined,
              label: query.label,
              page: next > 1 ? next : undefined,
            })}`
          }
        />
      </div>
    </div>
  );
}
