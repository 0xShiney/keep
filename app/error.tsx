"use client";

import { ErrorPanel } from "@/components/error-panel";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <div className="w-full">
        <ErrorPanel
          title="Something went wrong"
          description={error.message || "An unexpected error occurred while rendering this page."}
          requestId={error.digest}
          onRetry={reset}
        />
      </div>
    </div>
  );
}
