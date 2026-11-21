import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border-border bg-surface-1 rounded-md border", className)} {...props} />
  );
}

export function PanelHeader({
  title,
  action,
  description,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex items-start justify-between gap-3 border-b px-3 py-2.5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-fg text-sm font-semibold">{title}</h2>
        {description ? <p className="text-fg-subtle mt-0.5 text-xs">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-3 py-3", className)} {...props} />;
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return <div className="text-fg-subtle px-3 py-6 text-center text-sm">{children}</div>;
}
