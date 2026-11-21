import type { Metadata } from "next";
import Link from "next/link";
import { GitCompare } from "lucide-react";
import { CommitList } from "@/components/commit-list";
import { DiffView } from "@/components/diff-view";
import { RepoHeader } from "@/components/repo-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { assertValidRevision, InvalidRefError } from "@/lib/git/refs";
import { buildQueryString, pluralize } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { loadCompare } from "@/server/commits";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · compare` };
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ base?: string; head?: string; mode?: string; expand?: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const query = await searchParams;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/compare`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");

  const branches = await gateway.listBranches(owner, repoName).catch(() => []);
  const tags = await gateway.listTags(owner, repoName).catch(() => []);

  const base = query.base || repo.defaultBranch;
  const head = query.head || branches.find((branch) => !branch.isDefault)?.name || "";

  const options = [
    ...branches.map((branch) => ({ value: branch.name, label: `branch: ${branch.name}` })),
    ...tags.map((tag) => ({ value: tag.name, label: `tag: ${tag.name}` })),
  ];

  let invalid = false;
  if (head) {
    try {
      assertValidRevision(base);
      assertValidRevision(head);
    } catch (error) {
      if (error instanceof InvalidRefError) invalid = true;
      else throw error;
    }
  }

  const comparison =
    head && !invalid ? await loadCompare(gateway, owner, repoName, base, head) : null;
  const mode = query.mode === "split" ? "split" : "unified";
  const baseHref = `/${owner}/${repoName}/compare${buildQueryString({
    base,
    head,
    mode: mode === "split" ? "split" : undefined,
  })}`;

  return (
    <div>
      <RepoHeader repo={repo} active="code" />

      <h2 className="text-fg mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <GitCompare aria-hidden="true" className="text-fg-subtle size-3.5" />
        Compare changes
      </h2>

      <form
        method="get"
        className="border-border bg-surface-1 mb-4 flex flex-wrap items-end gap-2 rounded-md border p-3"
      >
        <label className="text-2xs text-fg-muted flex min-w-40 flex-col gap-1 font-medium">
          Base
          <select
            name="base"
            defaultValue={base}
            className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-xs"
          >
            {options.map((option) => (
              <option key={`base-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden="true" className="text-fg-subtle pb-1.5">
          ←
        </span>
        <label className="text-2xs text-fg-muted flex min-w-40 flex-col gap-1 font-medium">
          Compare
          <select
            name="head"
            defaultValue={head}
            className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-xs"
          >
            <option value="">Choose a branch or tag…</option>
            {options.map((option) => (
              <option key={`head-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Compare
        </Button>
        {comparison ? (
          <div className="ml-auto flex items-center gap-1">
            <Link
              href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}mode=${mode === "split" ? "unified" : "split"}`}
              className="border-border text-2xs text-fg-muted hover:text-fg rounded-sm border px-2 py-1"
            >
              {mode === "split" ? "Unified view" : "Split view"}
            </Link>
          </div>
        ) : null}
      </form>

      {invalid ? (
        <EmptyState
          title="Invalid ref"
          description="The base or compare ref contains characters git forbids."
        />
      ) : !head ? (
        <EmptyState
          title="Choose something to compare"
          description="Pick a base and a head branch or tag to see the commits and diff between them."
        />
      ) : comparison ? (
        <div className="flex flex-col gap-4">
          <section aria-labelledby="compare-commits">
            <h3 id="compare-commits" className="text-fg mb-1.5 text-xs font-semibold">
              {pluralize(comparison.commits.length, "commit")} ahead
              {comparison.stats.files > 0
                ? ` · ${pluralize(comparison.stats.files, "file")} changed`
                : ""}
            </h3>
            <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
              <CommitList commits={comparison.commits} owner={owner} repo={repoName} />
            </div>
          </section>

          <section aria-labelledby="compare-diff">
            <h3 id="compare-diff" className="text-fg mb-1.5 text-xs font-semibold">
              Files changed
            </h3>
            <DiffView
              files={comparison.diff?.files ?? []}
              mode={mode}
              expandPath={query.expand}
              baseHref={baseHref}
              truncated={comparison.truncated}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
