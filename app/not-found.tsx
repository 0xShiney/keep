import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <FileQuestion aria-hidden="true" className="text-fg-subtle size-6" />
        <h1 className="text-fg text-lg font-semibold">Not found</h1>
        <p className="text-fg-muted text-sm">
          This page does not exist, or it belongs to a private repository you cannot access.
        </p>
        <div className="mt-1 flex gap-2">
          <ButtonLink href="/" variant="primary" size="sm">
            Go to dashboard
          </ButtonLink>
          <Link href="/search" className="text-fg-subtle text-xs underline underline-offset-2">
            Search
          </Link>
        </div>
      </div>
    </main>
  );
}
