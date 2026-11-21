import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { VisibilityBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { formatRelativeTime, pluralize } from "@/lib/utils";
import { pageContext } from "@/server/context";
import { listRepos } from "@/server/repos";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const { gateway } = await pageContext(`/search${query ? `?q=${encodeURIComponent(query)}` : ""}`);

  const results = query ? await listRepos(gateway, { query, limit: 30 }) : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Search"
        description="Repository search across this instance. Code and issue search are Planned."
      />

      <form action="/search" className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="text-fg-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            data-search-input
            autoFocus
            placeholder="Search repositories…"
            aria-label="Search repositories"
            className="border-border bg-surface-1 text-fg placeholder:text-fg-subtle focus-visible:border-ring focus-visible:outline-ring h-9 w-full rounded-sm border pr-2 pl-8 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
          />
        </div>
      </form>

      {!results ? (
        <EmptyState
          icon={<Search aria-hidden="true" className="size-5" />}
          title="Search your repositories"
          description="Type a name or description. Press / anywhere in the app to focus a search field."
        />
      ) : results.items.length === 0 ? (
        <EmptyState title="No repositories found" description={`Nothing matched “${query}”.`} />
      ) : (
        <section aria-labelledby="repo-results">
          <h2 id="repo-results" className="text-fg mb-1.5 text-xs font-semibold">
            Repositories ({pluralize(results.total, "result")})
          </h2>
          <ul className="divide-border border-border bg-surface-1 divide-y overflow-hidden rounded-md border">
            {results.items.map((repo) => (
              <li key={repo.id} className="hover:bg-surface-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/${repo.fullName}`}
                    className="text-accent text-xs font-medium hover:underline"
                  >
                    {repo.fullName}
                  </Link>
                  <VisibilityBadge isPrivate={repo.private} />
                  <span className="text-2xs text-fg-subtle ml-auto">
                    updated {formatRelativeTime(repo.updatedAt)}
                  </span>
                </div>
                {repo.description ? (
                  <p className="text-2xs text-fg-muted mt-0.5 line-clamp-2">{repo.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
