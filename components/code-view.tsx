import { cn } from "@/lib/utils";

export function HighlightedCode({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn("code-block scrollbar-thin overflow-x-auto", className)}
      // HTML comes from Shiki over server-side source text; the source is escaped
      // by Shiki, never injected raw.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function PlainCode({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <div className={cn("code-block scrollbar-thin overflow-x-auto", className)}>
      <pre className="m-0 min-w-full py-3 font-mono text-xs leading-[1.6]">
        <code>
          {lines.map((line, index) => (
            <span className="code-line" id={`L${index + 1}`} key={index}>
              <span className="line-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="code-text">{line === "" ? " " : line}</span>
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

export function CodeEmpty() {
  return <div className="text-fg-subtle px-3 py-6 text-center text-xs">This file is empty.</div>;
}
