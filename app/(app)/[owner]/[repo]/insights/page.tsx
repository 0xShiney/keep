import type { Metadata } from "next";
import { BarChart3, GitBranch, Users } from "lucide-react";
import { RepoHeader } from "@/components/repo-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { pluralize } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { listCommitHistory } from "@/server/commits";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · insights` };
}

/**
 * Insights are derived from the most recent 300 commits and the branch list.
 * Forgejo exposes no cheap aggregate endpoint, so these numbers are explicitly
 * labelled as a recent window rather than a full-history count.
 */
const WINDOW = 300;

export default async function InsightsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/insights`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");

  const [commits, branches] = await Promise.all([
    listCommitHistory(gateway, owner, repoName, {
      ref: repo.defaultBranch,
      page: 1,
      limit: 50,
    }).catch(() => ({ items: [], total: 0, hasMore: false })),
    gateway.listBranches(owner, repoName).catch(() => []),
  ]);

  const contributors = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const commit of commits.items) {
    const key = commit.author.login ?? commit.author.name;
    contributors.set(key, (contributors.get(key) ?? 0) + 1);
    const day = commit.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const contributorList = [...contributors.entries()].sort((a, b) => b[1] - a[1]);
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxDay = Math.max(1, ...days.map(([, count]) => count));
  const sampleSize = commits.items.length;

  return (
    <div>
      <RepoHeader repo={repo} active="insights" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title={
              <span className="flex items-center gap-1.5">
                <Users aria-hidden="true" className="text-fg-subtle size-3.5" />
                Contributors
              </span>
            }
            description={`From the latest ${sampleSize} commits on ${repo.defaultBranch}`}
          />
          <PanelBody>
            {contributorList.length === 0 ? (
              <p className="text-fg-subtle text-xs">No commits in this window.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {contributorList.map(([name, count]) => {
                  const width = Math.round((count / sampleSize) * 100);
                  return (
                    <li key={name} className="flex items-center gap-2 text-xs">
                      <span className="text-fg-muted w-28 truncate">{name}</span>
                      <span className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded-full">
                        <span
                          className="bg-accent block h-full rounded-full"
                          style={{ width: `${Math.max(3, width)}%` }}
                        />
                      </span>
                      <span className="text-2xs text-fg-subtle w-14 text-right">
                        {pluralize(count, "commit")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title={
              <span className="flex items-center gap-1.5">
                <BarChart3 aria-hidden="true" className="text-fg-subtle size-3.5" />
                Commit activity
              </span>
            }
            description="Last 14 active days in the sampled window"
          />
          <PanelBody>
            {days.length === 0 ? (
              <p className="text-fg-subtle text-xs">No activity to chart.</p>
            ) : (
              <div className="flex h-32 items-end gap-1" role="img" aria-label="Commits per day">
                {days.map(([day, count]) => (
                  <div key={day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      className="bg-accent/80 w-full rounded-t-[2px]"
                      style={{ height: `${Math.max(4, (count / maxDay) * 100)}%` }}
                      title={`${day}: ${count} commits`}
                    />
                    <span className="text-fg-subtle w-full truncate text-center text-[9px]">
                      {day.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            title={
              <span className="flex items-center gap-1.5">
                <GitBranch aria-hidden="true" className="text-fg-subtle size-3.5" />
                Branches
              </span>
            }
            description={pluralize(branches.length, "branch", "branches")}
          />
          <PanelBody className="flex flex-wrap gap-1.5">
            {branches.map((branch) => (
              <span
                key={branch.name}
                className="border-border bg-surface-2 text-2xs text-fg-muted rounded-sm border px-1.5 py-0.5 font-mono"
              >
                {branch.name}
              </span>
            ))}
          </PanelBody>
        </Panel>
      </div>

      <p className="text-2xs text-fg-subtle mt-3">
        Numbers are derived from repository data Forgejo already exposes; Keep never shells out to
        git. Full-history statistics are Planned.
      </p>
    </div>
  );
}
