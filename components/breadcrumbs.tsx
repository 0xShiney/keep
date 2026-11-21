import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Breadcrumbs({
  owner,
  repo,
  gitRef,
  path,
  mode = "tree",
  className,
}: {
  owner: string;
  repo: string;
  gitRef: string;
  path?: string;
  mode?: "tree" | "blob";
  className?: string;
}) {
  const segments = path ? path.split("/").filter(Boolean) : [];
  const encodedRef = encodeURIComponent(gitRef);

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-0.5 text-xs">
        <li>
          <Link href={`/${owner}/${repo}`} className="text-accent font-medium hover:underline">
            {repo}
          </Link>
        </li>
        <li aria-hidden="true" className="text-fg-subtle">
          <ChevronRight className="size-3.5" />
        </li>
        {segments.length === 0 ? (
          <li className="text-fg-muted" aria-current="page">
            {gitRef}
          </li>
        ) : (
          <>
            <li>
              <Link
                href={`/${owner}/${repo}/tree/${encodedRef}`}
                className="text-fg-muted hover:text-accent hover:underline"
              >
                {gitRef}
              </Link>
            </li>
            {segments.map((segment, index) => {
              const isLast = index === segments.length - 1;
              const subPath = segments.slice(0, index + 1).join("/");
              const encodedPath = subPath.split("/").map(encodeURIComponent).join("/");
              const href =
                isLast && mode === "blob"
                  ? `/${owner}/${repo}/blob/${encodedRef}/${encodedPath}`
                  : `/${owner}/${repo}/tree/${encodedRef}/${encodedPath}`;
              return (
                <li key={subPath} className="flex items-center gap-0.5">
                  <span aria-hidden="true" className="text-fg-subtle">
                    <ChevronRight className="size-3.5" />
                  </span>
                  {isLast ? (
                    <span className="text-fg font-medium" aria-current="page">
                      {segment}
                    </span>
                  ) : (
                    <Link href={href} className="text-fg-muted hover:text-accent hover:underline">
                      {segment}
                    </Link>
                  )}
                </li>
              );
            })}
          </>
        )}
      </ol>
    </nav>
  );
}
