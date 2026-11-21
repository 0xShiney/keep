import Link from "next/link";
import type { ReactNode } from "react";
import { ClonePanel } from "@/components/clone-panel";
import { VisibilityBadge } from "@/components/ui/badge";
import type { RepoSummary } from "@/lib/forgejo/model";
import { cn } from "@/lib/utils";

export type RepoTab = "code" | "issues" | "pulls" | "releases" | "insights" | "settings";

const TABS: { key: RepoTab; label: string; segment: string }[] = [
  { key: "code", label: "Code", segment: "" },
  { key: "issues", label: "Issues", segment: "/issues" },
  { key: "pulls", label: "Pull requests", segment: "/pulls" },
  { key: "releases", label: "Releases", segment: "/releases" },
  { key: "insights", label: "Insights", segment: "/insights" },
  { key: "settings", label: "Settings", segment: "/settings" },
];

export function RepoHeader({
  repo,
  active,
  counts,
  actions,
}: {
  repo: RepoSummary;
  active: RepoTab;
  counts?: { issues?: number; pulls?: number };
  actions?: ReactNode;
}) {
  const base = `/${repo.owner}/${repo.name}`;

  return (
    <div className="border-border mb-4 border-b">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-md text-fg-subtle">
              <Link href={`/${repo.owner}`} className="hover:text-fg">
                {repo.owner}
              </Link>
              <span aria-hidden="true"> / </span>
            </span>
            <h1 className="text-md text-fg truncate font-semibold">
              <Link href={base} className="hover:text-accent">
                {repo.name}
              </Link>
            </h1>
            <VisibilityBadge isPrivate={repo.private} />
            {repo.archived ? <span className="text-2xs text-warning">Archived</span> : null}
          </div>
          {repo.description ? (
            <p className="text-fg-muted mt-0.5 max-w-2xl text-xs">{repo.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <ClonePanel httpsUrl={repo.cloneUrlHttps} sshUrl={repo.cloneUrlSsh} />
        </div>
      </div>

      <nav
        aria-label="Repository sections"
        className="-mb-px flex scrollbar-thin gap-1 overflow-x-auto"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const count =
            tab.key === "issues"
              ? (counts?.issues ?? repo.openIssues)
              : tab.key === "pulls"
                ? (counts?.pulls ?? repo.openPulls)
                : null;
          return (
            <Link
              key={tab.key}
              href={`${base}${tab.segment}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs whitespace-nowrap transition-colors",
                isActive
                  ? "border-accent text-fg font-medium"
                  : "text-fg-muted hover:border-border-strong hover:text-fg border-transparent",
              )}
            >
              {tab.label}
              {count !== null && count > 0 ? (
                <span className="bg-surface-2 text-2xs text-fg-subtle rounded-full px-1.5">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
