import type { Metadata } from "next";
import Link from "next/link";
import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import { CreatePullForm } from "@/components/forms/pull-forms";
import { LabelList } from "@/components/labels";
import { Pagination } from "@/components/pagination";
import { RepoHeader } from "@/components/repo-header";
import { EmptyState } from "@/components/ui/feedback";
import { buildQueryString, cn, formatRelativeTime, pluralize } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { loadRepoForPage, pageContext } from "@/server/context";
import { listPulls, pullStatus } from "@/server/pulls";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · pull requests` };
}

const STATES = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

function StatusIcon({ status }: { status: "open" | "merged" | "closed" | "draft" }) {
  if (status === "merged")
    return <GitMerge aria-hidden="true" className="text-status-merged mt-0.5 size-3.5 shrink-0" />;
  if (status === "closed")
    return (
      <GitPullRequestClosed
        aria-hidden="true"
        className="text-status-closed mt-0.5 size-3.5 shrink-0"
      />
    );
  if (status === "draft")
    return (
      <GitPullRequestDraft
        aria-hidden="true"
        className="text-status-draft mt-0.5 size-3.5 shrink-0"
      />
    );
  return <GitPullRequest aria-hidden="true" className="text-success mt-0.5 size-3.5 shrink-0" />;
}

export default async function PullsPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ state?: string; page?: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const query = await searchParams;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/pulls`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "pull:read");

  const state = query.state === "closed" || query.state === "all" ? query.state : "open";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const [pulls, branches] = await Promise.all([
    listPulls(gateway, owner, repoName, { state, page, limit: 25 }),
    state === "open" ? gateway.listBranches(owner, repoName).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div>
      <RepoHeader
        repo={repo}
        active="pulls"
        counts={{ issues: repo.openIssues, pulls: repo.openPulls }}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Filter by state">
          {STATES.map((item) => (
            <Link
              key={item.value}
              href={`/${owner}/${repoName}/pulls${buildQueryString({
                state: item.value === "open" ? undefined : item.value,
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
        <div className="ml-auto">
          <CreatePullForm
            owner={owner}
            repo={repoName}
            branches={branches.map((branch) => branch.name)}
            defaultBase={repo.defaultBranch}
          />
        </div>
      </div>

      <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
        {pulls.items.length === 0 ? (
          <EmptyState
            className="border-0"
            title={state === "open" ? "No open pull requests" : "No pull requests"}
            description="Open a pull request to review changes before merging them."
            action={
              <ButtonLink href={`/${owner}/${repoName}/branches`} variant="outline" size="sm">
                View branches
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {pulls.items.map((pull) => {
              const status = pullStatus(pull);
              return (
                <li key={pull.id} className="hover:bg-surface-2 flex items-start gap-2 px-3 py-2">
                  <StatusIcon status={status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/${owner}/${repoName}/pulls/${pull.number}`}
                        className="text-fg hover:text-accent text-xs font-medium hover:underline"
                      >
                        {pull.title}
                      </Link>
                      <LabelList labels={pull.labels} />
                    </div>
                    <p className="text-2xs text-fg-subtle mt-0.5">
                      #{pull.number} · {pull.headRef} → {pull.baseRef} · opened{" "}
                      {formatRelativeTime(pull.createdAt)} by {pull.author.login}
                    </p>
                  </div>
                  <span className="text-2xs text-fg-subtle shrink-0 font-mono">
                    <span className="text-success">+{pull.additions}</span>{" "}
                    <span className="text-danger">-{pull.deletions}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-2xs text-fg-subtle">{pluralize(pulls.total, "pull request")}</span>
        <Pagination
          page={page}
          hasMore={pulls.hasMore}
          label="pull requests"
          buildHref={(next) =>
            `/${owner}/${repoName}/pulls${buildQueryString({
              state: state === "open" ? undefined : state,
              page: next > 1 ? next : undefined,
            })}`
          }
        />
      </div>
    </div>
  );
}
