import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  hasMore,
  hasPrevious,
  buildHref,
  label = "items",
}: {
  page: number;
  hasMore: boolean;
  hasPrevious?: boolean;
  buildHref: (page: number) => string;
  label?: string;
}) {
  const previous = hasPrevious ?? page > 1;
  if (!previous && !hasMore) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-1">
      <span className="text-2xs text-fg-subtle">Page {page}</span>
      <div className="flex items-center gap-1">
        {previous ? (
          <Link
            href={buildHref(page - 1)}
            className={cn(
              "border-border bg-surface-1 text-fg-muted hover:border-border-strong hover:text-fg inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs",
            )}
            rel="prev"
          >
            <ChevronLeft aria-hidden="true" className="size-3.5" />
            Previous
          </Link>
        ) : null}
        {hasMore ? (
          <Link
            href={buildHref(page + 1)}
            className="border-border bg-surface-1 text-fg-muted hover:border-border-strong hover:text-fg inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs"
            rel="next"
          >
            Next {label}
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
