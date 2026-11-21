"use client";

import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  pending,
  children,
  variant = "primary",
  size = "md",
  disabled,
}: {
  pending: boolean;
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || disabled}>
      {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function FormFeedback({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (!error && !success) return null;
  return (
    <div aria-live="polite" className="text-xs">
      {error ? (
        <p
          role="alert"
          className="border-danger/30 bg-danger-subtle text-danger rounded-sm border px-2 py-1.5"
        >
          {error}
        </p>
      ) : (
        <p className="border-success/30 bg-success-subtle text-success flex items-center gap-1 rounded-sm border px-2 py-1.5">
          <Check aria-hidden="true" className="size-3" />
          {success}
        </p>
      )}
    </div>
  );
}

export function Disclosure({
  summary,
  children,
  className,
}: {
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={className}>
      <summary className="border-border bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3 inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border px-3 text-sm [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="border-border bg-surface-1 mt-2 rounded-md border p-3">{children}</div>
    </details>
  );
}
