import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "border-border bg-surface-1 text-fg placeholder:text-fg-subtle h-8 w-full rounded-sm border px-2.5 text-sm",
      "hover:border-border-strong focus-visible:border-ring focus-visible:outline-ring transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1",
      "aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 6, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(
      "border-border bg-surface-1 text-fg placeholder:text-fg-subtle w-full resize-y rounded-sm border px-2.5 py-2 text-sm leading-6",
      "hover:border-border-strong focus-visible:border-ring focus-visible:outline-ring transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1",
      "aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  className,
  children,
  hint,
  htmlFor,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-fg flex flex-col gap-1.5 text-sm font-medium", className)}
      {...props}
    >
      {children}
      {hint ? <span className="text-fg-subtle text-xs font-normal">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-danger text-xs">
      {children}
    </p>
  );
}
