import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, FolderGit2, Plus, Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Badge, VisibilityBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Panel, PanelBody, PanelEmpty, PanelHeader } from "@/components/ui/panel";
import { pageContext } from "@/server/context";
import { listRecentRepos, listRepos } from "@/server/repos";
import { describeActivity, loadActivity } from "@/server/activity";
import { formatRelativeTime, pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const { identity, gateway } = await pageContext("/");

  const [repos, recent, activity] = await Promise.all([
    listRepos(gateway, { query, limit: 30 }),
    listRecentRepos(identity.userId, 5),
    loadActivity(gateway, 10),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Dashboard"
        description={
          query
            ? `Repositories matching “${query}”`
            : `${pluralize(repos.total, "repository", "repositories")} on this instance`
        }
        actions={
          <ButtonLink href="/new" variant="primary" size="md">
            <Plus aria-hidden="true" />
            New repository
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="repos-heading" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="repos-heading" className="text-fg text-sm font-semibold">
              Your repositories
            </h2>
            <form action="/" className="relative w-full max-w-64">
              <Search
                aria-hidden="true"
                className="text-fg-subtle pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
              />
              <input
                type="search"
                name="q"
                defaultValue={query}
                data-search-input
                placeholder="Filter repositories…"
                aria-label="Filter repositories"
                className="border-border bg-surface-1 text-fg placeholder:text-fg-subtle focus-visible:border-ring focus-visible:outline-ring h-8 w-full rounded-sm border pr-2 pl-7 text-xs focus-visible:outline-2 focus-visible:outline-offset-1"
              />
            </form>
          </div>

          {repos.items.length === 0 ? (
            <EmptyState
              icon={<FolderGit2 aria-hidden="true" className="size-5" />}
              title={query ? "No repositories match that filter" : "No repositories yet"}
              description={
                query
                  ? "Try a different name, or clear the filter."
                  : "Create your first private repository, then push to it over SSH or HTTPS."
              }
              action={
                query ? (
                  <ButtonLink href="/" variant="outline" size="sm">
                    Clear filter
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/new" variant="primary" size="sm">
                    <Plus aria-hidden="true" />
                    Create repository
                  </ButtonLink>
                )
              }
            />
          ) : (
            <ul className="divide-border border-border flex flex-col divide-y overflow-hidden rounded-md border">
              {repos.items.map((repo) => (
                <li key={repo.id} className="bg-surface-1 hover:bg-surface-2 transition-colors">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/${repo.fullName}`}
                          className="text-accent truncate text-sm font-medium hover:underline"
                        >
                          {repo.fullName}
                        </Link>
                        <VisibilityBadge isPrivate={repo.private} />
                        {repo.archived ? <Badge tone="warning">Archived</Badge> : null}
                      </div>
                      {repo.description ? (
                        <p className="text-fg-muted mt-0.5 line-clamp-1 text-xs">
                          {repo.description}
                        </p>
                      ) : null}
                      <div className="text-2xs text-fg-subtle mt-1.5 flex flex-wrap items-center gap-3">
                        {repo.language ? (
                          <span className="flex items-center gap-1">
                            <span aria-hidden="true" className="bg-accent/70 size-2 rounded-full" />
                            {repo.language}
                          </span>
                        ) : null}
                        <span>Updated {formatRelativeTime(repo.updatedAt)}</span>
                        {repo.openIssues > 0 ? (
                          <span>{pluralize(repo.openIssues, "issue")}</span>
                        ) : null}
                        {repo.openPulls > 0 ? (
                          <span>{pluralize(repo.openPulls, "pull request")}</span>
                        ) : null}
                      </div>
                    </div>
                    <Link
                      href={`/${repo.fullName}`}
                      className="text-fg-subtle hover:bg-surface-3 hover:text-fg mt-0.5 rounded-sm p-1"
                      aria-label={`Open ${repo.fullName}`}
                    >
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {repos.hasMore ? (
            <p className="text-2xs text-fg-subtle">
              Showing the first {repos.items.length} of {repos.total}. Refine the filter to narrow
              the list.
            </p>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel>
            <PanelHeader title="Recently accessed" />
            {recent.length === 0 ? (
              <PanelEmpty>Repositories you open will appear here.</PanelEmpty>
            ) : (
              <ul className="divide-border divide-y">
                {recent.map((entry) => (
                  <li key={entry.fullName}>
                    <Link
                      href={`/${entry.fullName}`}
                      className="text-fg-muted hover:bg-surface-2 hover:text-fg flex items-center gap-2 px-3 py-2 text-xs"
                    >
                      <FolderGit2 aria-hidden="true" className="text-fg-subtle size-3.5" />
                      <span className="truncate">{entry.fullName}</span>
                      <span className="text-2xs text-fg-subtle ml-auto shrink-0">
                        {formatRelativeTime(entry.lastAccessedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recent activity" />
            {activity.length === 0 ? (
              <PanelEmpty>No recorded activity yet.</PanelEmpty>
            ) : (
              <ul className="divide-border divide-y">
                {activity.map((event) => (
                  <li key={event.id} className="flex items-start gap-2 px-3 py-2">
                    <Avatar name={event.actor?.login ?? "system"} size={18} />
                    <div className="text-2xs text-fg-muted min-w-0">
                      <p className="truncate">
                        <span className="text-fg font-medium">
                          {event.actor?.login ?? "system"}
                        </span>{" "}
                        {describeActivity(event)}{" "}
                        {event.repoOwner && event.repoName ? (
                          <Link
                            href={`/${event.repoOwner}/${event.repoName}`}
                            className="text-accent underline underline-offset-2"
                          >
                            {event.repoOwner}/{event.repoName}
                          </Link>
                        ) : null}
                      </p>
                      {event.content ? (
                        <p className="text-fg-subtle mt-0.5 line-clamp-1 font-mono">
                          {event.content}
                        </p>
                      ) : null}
                      <p className="text-fg-subtle mt-0.5 flex items-center gap-1">
                        <Activity aria-hidden="true" className="size-2.5" />
                        {formatRelativeTime(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
