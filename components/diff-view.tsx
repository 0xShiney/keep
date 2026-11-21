import Link from "next/link";
import { ChevronRight, FileDiff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toSplitRows, type DiffFile, type DiffLine } from "@/lib/git/diff";
import { wordDiff } from "@/lib/git/word-diff";
import { cn, pluralize } from "@/lib/utils";

export type DiffMode = "unified" | "split";

/** Total lines we will render as HTML on one page; the rest load on demand. */
const RENDER_BUDGET = 3_500;
const AUTO_OPEN_LINES = 500;

const STATUS_LABEL: Record<string, string> = {
  added: "added",
  deleted: "deleted",
  modified: "modified",
  renamed: "renamed",
  copied: "copied",
};

function fileLineCount(file: DiffFile): number {
  return file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
}

/**
 * Decides which files start expanded without spending a render budget on more
 * than RENDER_BUDGET lines. Pure, so the compiler can treat the render as pure.
 */
interface FileLayout {
  fits: boolean;
  openByDefault: boolean;
}

function computeLayout(files: DiffFile[], expandPath?: string): FileLayout[] {
  let budget = RENDER_BUDGET;
  return files.map((file, index) => {
    const lines = fileLineCount(file);
    const forced = expandPath === file.path;
    const fits = forced || lines <= budget;
    if (fits) budget -= lines;
    return {
      fits,
      openByDefault: forced || (index < 2 && lines <= AUTO_OPEN_LINES && fits),
    };
  });
}

function typeLabel(type: DiffLine["type"]): string {
  if (type === "add") return "added line";
  if (type === "del") return "removed line";
  return "context line";
}

function UnifiedHunks({ file }: { file: DiffFile }) {
  return (
    <div className="diff-table scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse font-mono text-xs">
        <caption className="sr-only">
          Unified diff for {file.path}: {file.additions} added lines, {file.deletions} removed lines
        </caption>
        <tbody>
          {file.hunks.map((hunk, hunkIndex) => (
            <tr key={`${hunk.header}-${hunkIndex}`} className="diff-hunk">
              <td colSpan={3} className="text-2xs text-fg-subtle px-2 py-1 select-none">
                {hunk.header}
              </td>
            </tr>
          ))}
          {file.hunks.flatMap((hunk, hunkIndex) =>
            hunk.lines.map((line, lineIndex) => (
              <tr
                key={`${hunkIndex}-${lineIndex}`}
                className={cn(
                  "align-top",
                  line.type === "add" && "bg-diff-add",
                  line.type === "del" && "bg-diff-del",
                )}
              >
                <td
                  aria-hidden="true"
                  className="border-border/60 text-2xs text-fg-subtle w-10 border-r px-2 text-right select-none"
                >
                  {line.oldNumber ?? ""}
                </td>
                <td
                  aria-hidden="true"
                  className="border-border/60 text-2xs text-fg-subtle w-10 border-r px-2 text-right select-none"
                >
                  {line.newNumber ?? ""}
                </td>
                <td className="px-2 whitespace-pre">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mr-2 inline-block w-2 select-none",
                      line.type === "add" && "text-success",
                      line.type === "del" && "text-danger",
                    )}
                  >
                    {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                  </span>
                  <span className="sr-only">{typeLabel(line.type)}: </span>
                  {line.content || " "}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function SplitHunks({ file }: { file: DiffFile }) {
  return (
    <div className="diff-table scrollbar-thin overflow-x-auto">
      <table className="w-full table-fixed border-collapse font-mono text-xs">
        <caption className="sr-only">
          Split diff for {file.path}: {file.additions} added lines, {file.deletions} removed lines
        </caption>
        <tbody>
          {file.hunks.map((hunk, hunkIndex) => (
            <FragmentHunk key={`${hunk.header}-${hunkIndex}`} hunk={hunk} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentHunk({ hunk }: { hunk: { header: string; lines: DiffLine[] } }) {
  const rows = toSplitRows({
    header: hunk.header,
    section: "",
    oldStart: 0,
    oldLines: 0,
    newStart: 0,
    newLines: 0,
    lines: hunk.lines,
  });

  return (
    <>
      <tr className="diff-hunk">
        <td colSpan={4} className="text-2xs text-fg-subtle px-2 py-1 select-none">
          {hunk.header}
        </td>
      </tr>
      {rows.map((row, index) => {
        const both = row.left && row.right;
        const words = both ? wordDiff(row.left!.content, row.right!.content) : null;
        return (
          <tr key={index} className="align-top">
            <SideCell line={row.left} side="old" words={words?.old} />
            <SideCell line={row.right} side="new" words={words?.next} />
          </tr>
        );
      })}
    </>
  );
}

function SideCell({
  line,
  side,
  words,
}: {
  line: DiffLine | null;
  side: "old" | "new";
  words?: { value: string; changed: boolean }[];
}) {
  if (!line) {
    return (
      <td colSpan={2} className="border-border/60 bg-surface-1/60 border-r px-2 py-0.5">
        <span className="sr-only">No corresponding line</span>
      </td>
    );
  }

  return (
    <>
      <td
        aria-hidden="true"
        className={cn(
          "border-border/60 text-2xs text-fg-subtle w-9 border-r px-1.5 text-right select-none",
          line.type === "del" && "bg-diff-del",
          line.type === "add" && "bg-diff-add",
        )}
      >
        {(side === "old" ? line.oldNumber : line.newNumber) ?? ""}
      </td>
      <td
        className={cn(
          "border-border/60 border-r px-2 py-0.5 break-all whitespace-pre-wrap",
          line.type === "del" && "bg-diff-del",
          line.type === "add" && "bg-diff-add",
        )}
      >
        <span className="sr-only">{typeLabel(line.type)}: </span>
        {words
          ? words.map((segment, index) =>
              segment.changed ? (
                <mark
                  key={index}
                  className={cn(
                    "rounded-[2px] bg-transparent",
                    side === "old" ? "bg-diff-del-word" : "bg-diff-add-word",
                  )}
                >
                  {segment.value}
                </mark>
              ) : (
                <span key={index}>{segment.value}</span>
              ),
            )
          : line.content || " "}
      </td>
    </>
  );
}

/**
 * Server-rendered diff. Files are native <details> disclosures, and a page-wide
 * line budget means a 500-file diff never serialises megabytes of HTML: files
 * beyond the budget offer a link that renders just that file.
 */
export function DiffView({
  files,
  mode = "unified",
  expandPath,
  baseHref,
  truncated = false,
}: {
  files: DiffFile[];
  mode?: DiffMode;
  expandPath?: string;
  baseHref?: string;
  truncated?: boolean;
}) {
  if (files.length === 0) {
    return (
      <div className="border-border bg-surface-1 text-fg-subtle rounded-md border px-3 py-6 text-center text-xs">
        No textual changes in this diff.
      </div>
    );
  }

  const layout = computeLayout(files, expandPath);

  return (
    <div className="flex flex-col gap-2">
      {truncated ? (
        <p className="border-warning/30 bg-warning-subtle text-2xs text-warning rounded-sm border px-3 py-1.5">
          This diff was truncated by the server. Only the first files and lines are available.
        </p>
      ) : null}

      {files.map((file, index) => {
        const { fits, openByDefault } = layout[index] ?? { fits: false, openByDefault: false };
        const lines = fileLineCount(file);

        return (
          <details
            key={`${file.path}-${index}`}
            open={openByDefault}
            className="group border-border bg-surface-1 overflow-hidden rounded-md border"
          >
            <summary className="border-border bg-surface-2/60 flex cursor-pointer list-none flex-wrap items-center gap-2 border-b px-2.5 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
              <ChevronRight
                aria-hidden="true"
                className="text-fg-subtle size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
              />
              <FileDiff aria-hidden="true" className="text-fg-subtle size-3.5 shrink-0" />
              <span className="text-fg min-w-0 font-mono break-all">{file.path}</span>
              {file.status !== "modified" ? (
                <Badge
                  tone={
                    file.status === "added"
                      ? "success"
                      : file.status === "deleted"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {STATUS_LABEL[file.status] ?? file.status}
                </Badge>
              ) : null}
              {file.binary ? <Badge tone="neutral">binary</Badge> : null}
              {file.truncated ? <Badge tone="warning">capped</Badge> : null}
              <span className="text-2xs ml-auto flex items-center gap-2 font-mono">
                <span className="text-success">+{file.additions}</span>
                <span className="text-danger">-{file.deletions}</span>
              </span>
            </summary>

            {file.binary ? (
              <p className="text-fg-subtle px-3 py-3 text-xs">Binary file — not rendered.</p>
            ) : !fits ? (
              <div className="text-fg-subtle px-3 py-3 text-xs">
                <p>{pluralize(lines, "line")} not rendered yet to keep this page small.</p>
                {baseHref ? (
                  <Link
                    href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}expand=${encodeURIComponent(file.path)}`}
                    className="text-accent mt-1 inline-block underline underline-offset-2"
                  >
                    Load this file&apos;s diff
                  </Link>
                ) : null}
              </div>
            ) : lines === 0 ? (
              <p className="text-fg-subtle px-3 py-3 text-xs">
                No line changes (mode or rename only).
              </p>
            ) : mode === "split" ? (
              <SplitHunks file={file} />
            ) : (
              <UnifiedHunks file={file} />
            )}
          </details>
        );
      })}
    </div>
  );
}
