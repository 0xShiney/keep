import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs font-medium leading-4",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-2 text-fg-muted",
        accent: "border-accent/30 bg-accent-subtle text-accent",
        success: "border-success/30 bg-success-subtle text-success",
        warning: "border-warning/30 bg-warning-subtle text-warning",
        danger: "border-danger/30 bg-danger-subtle text-danger",
        info: "border-info/30 bg-info-subtle text-info",
        outline: "border-border bg-transparent text-fg-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function VisibilityBadge({ isPrivate }: { isPrivate: boolean }) {
  return (
    <Badge tone="outline" className="gap-1">
      <span aria-hidden="true" className="text-fg-subtle">
        {isPrivate ? "●" : "○"}
      </span>
      {isPrivate ? "Private" : "Public"}
    </Badge>
  );
}
