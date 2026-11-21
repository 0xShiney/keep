import { cn } from "@/lib/utils";

/**
 * Renders Markdown that was already sanitised server-side by
 * lib/render/markdown.ts (strict rehype-sanitize allowlist). Never pass raw
 * user HTML here.
 */
export function MarkdownView({ html, className }: { html: string; className?: string }) {
  return (
    <div className={cn("markdown-body", className)} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
