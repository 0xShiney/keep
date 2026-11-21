import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, Lock, Plus } from "lucide-react";
import { BranchActions } from "@/components/forms/branch-actions";
import { RefSwitcher } from "@/components/ref-switcher";
import { RepoHeader } from "@/components/repo-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { formatRelativeTime } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · branches` };
}

export default async function BranchesPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/branches`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");
  const branches = await gateway.listBranches(owner, repoName);

  return (
    <div>
      <RepoHeader repo={repo} active="code" />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-fg flex items-center gap-1.5 text-sm font-semibold">
          <GitBranch aria-hidden="true" className="text-fg-subtle size-3.5" />
          Branches
          <span className="text-fg-subtle">({branches.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <RefSwitcher
            owner={owner}
            repo={repoName}
            current={repo.defaultBranch}
            branches={branches}
            tags={[]}
            mode="tree"
          />
          <BranchActions owner={owner} repo={repoName} branches={branches} />
        </div>
      </div>

      <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
        {branches.length === 0 ? (
          <EmptyState
            className="border-0"
            title="No branches"
            description="Push a branch to see it here."
            action={
              <ButtonLink href="/settings/keys" variant="outline" size="sm">
                <Plus aria-hidden="true" />
                Add an SSH key
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {branches.map((branch) => (
              <li
                key={branch.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/${owner}/${repoName}/tree/${encodeURIComponent(branch.name)}`}
                      className="text-accent font-mono text-xs hover:underline"
                    >
                      {branch.name}
                    </Link>
                    {branch.isDefault ? <Badge tone="accent">default</Badge> : null}
                    {branch.protected ? (
                      <Badge tone="neutral">
                        <Lock aria-hidden="true" className="size-2.5" />
                        protected
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-2xs text-fg-subtle mt-0.5 truncate">
                    {branch.message || "No commit message"}
                  </p>
                </div>
                <div className="text-2xs text-fg-subtle flex items-center gap-2">
                  <span>{branch.authorName}</span>
                  <span>{formatRelativeTime(branch.date)}</span>
                  <Link
                    href={`/${owner}/${repoName}/commits/${branch.sha}`}
                    className="border-border bg-surface-2 hover:text-fg rounded-sm border px-1.5 py-px font-mono"
                  >
                    {branch.sha.slice(0, 7)}
                  </Link>
                  <Link
                    href={`/${owner}/${repoName}/compare?base=${encodeURIComponent(repo.defaultBranch)}&head=${encodeURIComponent(branch.name)}`}
                    className="text-accent hover:underline"
                  >
                    compare
                  </Link>
                  {!branch.isDefault ? (
                    <BranchActions
                      owner={owner}
                      repo={repoName}
                      branches={branches}
                      branchToDelete={branch.name}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
