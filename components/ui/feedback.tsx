import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? <div className="text-fg-subtle">{icon}</div> : null}
      <p className="text-fg text-sm font-medium">{title}</p>
      {description ? <p className="text-fg-subtle max-w-md text-xs">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function InlineNotice({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "warning" | "danger" | "info" | "success";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-surface-2 text-fg-muted",
    warning: "border-warning/30 bg-warning-subtle text-warning",
    danger: "border-danger/30 bg-danger-subtle text-danger",
    info: "border-info/30 bg-info-subtle text-info",
    success: "border-success/30 bg-success-subtle text-success",
  } as const;

  return (
    <div
      role="status"
      className={cn("rounded-sm border px-3 py-2 text-xs", tones[tone], className)}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="text-fg-subtle mb-1 text-xs">{eyebrow}</div> : null}
        <h1 className="text-fg truncate text-lg font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-fg-muted mt-0.5 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-border bg-surface-2 text-2xs text-fg-muted rounded-sm border px-1.5 py-0.5 font-mono">
      {children}
    </kbd>
  );
}
