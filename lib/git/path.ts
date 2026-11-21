/**
 * Repository paths arrive from URLs and query strings, so they are hostile until
 * validated. Nothing in the app ever turns these into filesystem paths — they
 * are sent to Forgejo as structured API parameters — but we still reject
 * traversal, NUL, backslashes and control characters at the boundary.
 */

export class InvalidPathError extends Error {
  readonly code = "invalid_path";
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

const MAX_PATH_LENGTH = 1024;
const MAX_SEGMENT_LENGTH = 255;

export function normalizeRepoPath(input: string | string[] | undefined | null): string {
  const raw = Array.isArray(input) ? input.join("/") : (input ?? "");

  if (raw === "" || raw === "/") return "";
  if (raw.length > MAX_PATH_LENGTH) throw new InvalidPathError("Path is too long");
  if (raw.includes("\u0000")) throw new InvalidPathError("Path contains a NUL byte");
  if (raw.includes("\\")) throw new InvalidPathError("Path contains a backslash");
  if (/[\u0001-\u001f\u007f]/.test(raw))
    throw new InvalidPathError("Path contains control characters");
  if (raw.startsWith("/")) throw new InvalidPathError("Path must be relative");

  const segments = raw.split("/").filter((segment) => segment !== "");
  const normalized: string[] = [];

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new InvalidPathError("Path traversal is not allowed");
    }
    if (segment.length > MAX_SEGMENT_LENGTH) throw new InvalidPathError("Path segment is too long");
    normalized.push(segment);
  }

  return normalized.join("/");
}

/** Decodes each URL segment exactly once; malformed escapes are rejected. */
export function decodePathSegments(segments: string[] | undefined): string {
  if (!segments) return "";
  return normalizeRepoPath(segments.map(decodeSegment));
}

export function assertSafeRepoPath(path: string): string {
  return normalizeRepoPath(path);
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new InvalidPathError("Path contains malformed percent-encoding");
  }
}

/**
 * Splits a `/{kind}/{ref}/{path...}` URL into its revision and repository path.
 *
 * Tree, blob and raw links all put the revision (branch or tag) in the first
 * segment. `encodeURIComponent` escapes `/` inside a branch name (`feature%2Fx`),
 * so a ref containing slashes arrives as one segment and is not confused with
 * the file path. An explicit `?ref=` overrides the segment, which keeps older
 * links (`/blob/some/path?ref=main`) working.
 */
export function splitRefPath(
  segments: string[] | undefined,
  options: { ref?: string; defaultBranch: string },
): { ref: string; path: string } {
  if (options.ref) {
    return { ref: options.ref, path: decodePathSegments(segments) };
  }
  if (!segments || segments.length === 0) {
    return { ref: options.defaultBranch, path: "" };
  }

  const [first, ...rest] = segments.map(decodeSegment);
  return { ref: first, path: normalizeRepoPath(rest) };
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp"]);

export function fileExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** Only raster formats we are confident a browser renders safely. */
export function isSafePreviewImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(path));
}

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function isMarkdownPath(path: string): boolean {
  return ["md", "markdown", "mdown", "mdx"].includes(fileExtension(path));
}
