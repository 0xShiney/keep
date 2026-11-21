"use client";

import { useState } from "react";
import { Code2, Eye } from "lucide-react";
import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MarkdownFileView({
  markdownHtml,
  rawContent,
}: {
  markdownHtml: string;
  rawContent: string;
}) {
  const [view, setView] = useState<"preview" | "raw">("preview");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Markdown view"
        className="border-border bg-surface-2/50 flex items-center gap-1 border-b px-2 py-1"
      >
        <Button
          role="tab"
          aria-selected={view === "preview"}
          variant={view === "preview" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("preview")}
        >
          <Eye aria-hidden="true" />
          Preview
        </Button>
        <Button
          role="tab"
          aria-selected={view === "raw"}
          variant={view === "raw" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("raw")}
        >
          <Code2 aria-hidden="true" />
          Raw
        </Button>
      </div>
      {view === "preview" ? (
        <div className="px-4 py-3">
          <MarkdownView html={markdownHtml} />
        </div>
      ) : (
        <pre
          className={cn(
            "text-fg scrollbar-thin overflow-x-auto px-4 py-3 font-mono text-xs leading-6 whitespace-pre",
          )}
        >
          {rawContent}
        </pre>
      )}
    </div>
  );
}
