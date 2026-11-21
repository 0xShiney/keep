/**
 * Unified diff parser.
 *
 * Diffs come from Forgejo as `.diff` text. They are parsed server-side into a
 * structured model so the UI can render file-by-file with lazy expansion, apply
 * per-file caps, and never hand unbounded text to the browser.
 */

export type DiffStatus = "added" | "deleted" | "modified" | "renamed" | "copied";

export interface DiffLine {
  type: "ctx" | "add" | "del";
  content: string;
  oldNumber: number | null;
  newNumber: number | null;
}

export interface DiffHunk {
  header: string;
  section: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string | null;
  newPath: string | null;
  path: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
  truncated: boolean;
  tooLarge: boolean;
}

export interface ParsedDiff {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  truncated: boolean;
}

export interface DiffParseLimits {
  maxFiles: number;
  maxBytesPerFile: number;
  maxLinesPerFile: number;
}

export const DEFAULT_DIFF_LIMITS: DiffParseLimits = {
  maxFiles: 500,
  maxBytesPerFile: 512 * 1024,
  maxLinesPerFile: 5_000,
};

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function stripPrefix(path: string, prefix: "a/" | "b/"): string | null {
  if (path === "/dev/null") return null;
  let cleaned = path.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).replace(/\\"/g, '"');
  }
  if (cleaned.startsWith(prefix)) return cleaned.slice(2);
  return cleaned;
}

function parseGitHeaderPaths(line: string): { oldPath: string | null; newPath: string | null } {
  // `diff --git a/path b/path`, with quoted paths when they contain spaces.
  const rest = line.slice("diff --git ".length).trim();
  if (rest.startsWith('"')) {
    const match = rest.match(/^("(?:[^"\\]|\\.)*")\s+("(?:[^"\\]|\\.)*")$/);
    if (match?.[1] && match[2]) {
      return { oldPath: stripPrefix(match[1], "a/"), newPath: stripPrefix(match[2], "b/") };
    }
  }
  const bIndex = rest.lastIndexOf(" b/");
  if (bIndex > 0) {
    return {
      oldPath: stripPrefix(rest.slice(0, bIndex), "a/"),
      newPath: stripPrefix(rest.slice(bIndex + 1), "b/"),
    };
  }
  return { oldPath: null, newPath: rest || null };
}

function toStringPath(raw: string): string | null {
  return stripPrefix(raw, raw.startsWith("a/") ? "a/" : "b/");
}

/**
 * Parses a diff. Malformed input never throws: unknown lines are ignored and the
 * file list reflects whatever was parseable.
 */
export function parseUnifiedDiff(
  text: string,
  limits: DiffParseLimits = DEFAULT_DIFF_LIMITS,
): ParsedDiff {
  const lines = text.split("\n");
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let currentBytes = 0;
  let currentLineCount = 0;
  let oldCursor = 0;
  let newCursor = 0;
  let truncated = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (files.length >= limits.maxFiles) {
        truncated = true;
        current = null;
        currentHunk = null;
        continue;
      }
      const { oldPath, newPath } = parseGitHeaderPaths(line);
      const path = newPath ?? oldPath ?? "unknown";
      const file: DiffFile = {
        oldPath,
        newPath,
        path,
        status: "modified",
        additions: 0,
        deletions: 0,
        binary: false,
        hunks: [],
        truncated: false,
        tooLarge: false,
      };
      files.push(file);
      current = file;
      currentHunk = null;
      currentBytes = 0;
      currentLineCount = 0;
      continue;
    }

    if (!current) continue;

    if (line.startsWith("new file mode")) {
      current.status = "added";
      current.oldPath = null;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
      current.newPath = null;
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      current.oldPath = line.slice("rename from ".length);
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.status = "renamed";
      current.newPath = line.slice("rename to ".length);
      current.path = current.newPath ?? current.path;
      continue;
    }
    if (line.startsWith("copy from ")) {
      current.status = "copied";
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      current.binary = true;
      continue;
    }
    if (line.startsWith("--- ")) {
      if (current.oldPath === null) current.oldPath = toStringPath(line.slice(4));
      if (line.startsWith("--- /dev/null")) current.status = "added";
      continue;
    }
    if (line.startsWith("+++ ")) {
      if (line.startsWith("+++ /dev/null")) current.status = "deleted";
      else if (current.newPath === null) current.newPath = toStringPath(line.slice(4));
      continue;
    }

    if (line.startsWith("@@ ")) {
      const match = HUNK_HEADER.exec(line);
      if (!match) continue;
      const oldStart = Number(match[1] ?? 0);
      const oldLines = match[2] === undefined ? 1 : Number(match[2]);
      const newStart = Number(match[3] ?? 0);
      const newLines = match[4] === undefined ? 1 : Number(match[4]);
      const section = (match[5] ?? "").trim();
      currentHunk = {
        header: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@${section ? ` ${section}` : ""}`,
        section,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      };
      current.hunks.push(currentHunk);
      oldCursor = oldStart;
      newCursor = newStart;
      continue;
    }

    if (!currentHunk) continue;

    // Once a file exceeds a cap we keep the hunk metadata but stop accumulating
    // lines, so the UI can offer "load anyway" without a giant payload.
    if (currentBytes >= limits.maxBytesPerFile || currentLineCount >= limits.maxLinesPerFile) {
      current.truncated = true;
      if (currentBytes > limits.maxBytesPerFile * 4) current.tooLarge = true;
      continue;
    }

    if (line.startsWith("\\")) {
      // "\ No newline at end of file" carries no content.
      continue;
    }

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        content: line.slice(1),
        oldNumber: null,
        newNumber: newCursor,
      });
      newCursor += 1;
      current.additions += 1;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "del",
        content: line.slice(1),
        oldNumber: oldCursor,
        newNumber: null,
      });
      oldCursor += 1;
      current.deletions += 1;
    } else if (line.startsWith(" ") || line === "") {
      currentHunk.lines.push({
        type: "ctx",
        content: line.slice(1),
        oldNumber: oldCursor,
        newNumber: newCursor,
      });
      oldCursor += 1;
      newCursor += 1;
    } else {
      // Unknown line (e.g. "index abc..def"): ignore but count bytes.
      currentBytes += line.length + 1;
      continue;
    }

    currentBytes += line.length + 1;
    currentLineCount += 1;
  }

  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return { files, totalAdditions, totalDeletions, truncated };
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

export function summarizeDiff(files: DiffFile[]): DiffStats {
  return {
    files: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

/**
 * Maps a file line number to Forgejo's diff "position": the 1-based index of the
 * line within the file's hunks. Review comments are anchored with this value.
 */
export function newPositionForLine(file: DiffFile, lineNumber: number): number | null {
  let position = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      position += 1;
      if (line.type !== "del" && line.newNumber === lineNumber) return position;
    }
  }
  return null;
}

/** Splits a parsed file's lines back into paired rows for split-view rendering. */
export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

export function toSplitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;
  const lines = hunk.lines;

  while (index < lines.length) {
    const line = lines[index]!;
    if (line.type === "ctx") {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }

    const deletions: DiffLine[] = [];
    const additions: DiffLine[] = [];
    while (index < lines.length && lines[index]!.type === "del") {
      deletions.push(lines[index]!);
      index += 1;
    }
    while (index < lines.length && lines[index]!.type === "add") {
      additions.push(lines[index]!);
      index += 1;
    }

    if (deletions.length === 0 && additions.length === 0) {
      index += 1;
      continue;
    }

    const max = Math.max(deletions.length, additions.length);
    for (let i = 0; i < max; i += 1) {
      rows.push({ left: deletions[i] ?? null, right: additions[i] ?? null });
    }
  }

  return rows;
}
