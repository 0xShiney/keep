"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ErrorPanel({
  title = "This page could not be loaded",
  description,
  requestId,
  onRetry,
}: {
  title?: string;
  description?: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className="border-danger/30 bg-danger-subtle flex flex-col gap-3 rounded-md border px-4 py-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="text-danger mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-fg font-medium">{title}</p>
          {description ? <p className="text-fg-muted mt-0.5 text-xs">{description}</p> : null}
          {requestId ? (
            <p className="text-2xs text-fg-subtle mt-1 font-mono">request id: {requestId}</p>
          ) : null}
        </div>
      </div>
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (onRetry) onRetry();
            else startTransition(() => router.refresh());
          }}
          disabled={pending}
        >
          <RotateCw aria-hidden="true" />
          {pending ? "Retrying…" : "Retry"}
        </Button>
      </div>
    </div>
  );
}
