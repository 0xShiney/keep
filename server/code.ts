import type { ForgejoGateway } from "@/lib/forgejo/gateway";
import type { FileBlob, TreeEntry } from "@/lib/forgejo/model";
import { fileExtension, isMarkdownPath, isSafePreviewImage } from "@/lib/git/path";
import { highlightCode, type ThemeName } from "@/lib/render/highlight";
import { renderMarkdown } from "@/lib/render/markdown";

/** Files larger than this are shown as text without highlighting. */
export const MAX_HIGHLIGHT_FILE_BYTES = 1024 * 1024;
/** Files larger than this are never loaded into the viewer; download only. */
export const MAX_VIEW_FILE_BYTES = 10 * 1024 * 1024;
/** Text preview cap for very large source files. */
export const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

export interface TreeResult {
  entries: TreeEntry[];
  readmeHtml: string | null;
  readmeName: string | null;
}

export async function loadTree(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  ref: string,
  path: string,
): Promise<TreeResult> {
  const { entries, readme } = await gateway.listTree(owner, name, ref, path);
  let readmeHtml: string | null = null;
  let readmeName: string | null = null;

  if (readme && !readme.isBinary) {
    const content = decodeBase64(readme.contentBase64);
    if (content !== null && Buffer.byteLength(content, "utf8") <= MAX_TEXT_PREVIEW_BYTES) {
      const isMarkdown = isMarkdownPath(readme.path);
      readmeName = readme.name;
      readmeHtml = isMarkdown
        ? await renderMarkdown(content, {
            linkBase: `/${owner}/${name}/blob/${encodeURIComponent(ref)}`,
            rawBase: `/${owner}/${name}/raw/${encodeURIComponent(ref)}`,
          })
        : `<pre>${escapeHtml(content)}</pre>`;
    }
  }

  return { entries, readmeHtml, readmeName };
}

export type FileViewKind = "text" | "markdown" | "binary" | "too-large" | "image";

export interface FileView {
  path: string;
  name: string;
  sha: string;
  size: number;
  kind: FileViewKind;
  language: string | null;
  text: string | null;
  html: string | null;
  markdownHtml: string | null;
  highlighted: boolean;
  truncated: boolean;
  rawUrl: string;
  lineCount: number;
}

export function decodeBase64(base64: string | null): string | null {
  if (!base64) return null;
  try {
    const buffer = Buffer.from(base64, "base64");
    if (buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

export async function loadFileView(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  ref: string,
  path: string,
  theme: ThemeName,
): Promise<FileView> {
  const blob = await gateway.getFile(owner, name, ref, path);
  const rawUrl = `/${owner}/${name}/raw/${encodeURIComponent(ref)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  const base: FileView = {
    path: blob.path,
    name: blob.name,
    sha: blob.sha,
    size: blob.size,
    kind: "text",
    language: fileExtension(blob.path) || null,
    text: null,
    html: null,
    markdownHtml: null,
    highlighted: false,
    truncated: false,
    rawUrl,
    lineCount: 0,
  };

  if (blob.size > MAX_VIEW_FILE_BYTES) {
    return { ...base, kind: "too-large" };
  }

  if (blob.isBinary) {
    return { ...base, kind: isSafePreviewImage(blob.path) ? "image" : "binary" };
  }

  const content = decodeBase64(blob.contentBase64);
  if (content === null) return { ...base, kind: "binary" };

  const truncated = blob.size > MAX_TEXT_PREVIEW_BYTES;
  const text = truncated ? content.slice(0, MAX_TEXT_PREVIEW_BYTES) : content;
  const lineCount = text.length === 0 ? 0 : text.split("\n").length;

  if (isMarkdownPath(blob.path)) {
    const markdownHtml = await renderMarkdown(text, {
      linkBase: `/${owner}/${name}/blob/${encodeURIComponent(ref)}/${parentDir(blob.path)}`.replace(
        /\/$/,
        "",
      ),
      rawBase: `/${owner}/${name}/raw/${encodeURIComponent(ref)}/${parentDir(blob.path)}`.replace(
        /\/$/,
        "",
      ),
    });
    return { ...base, kind: "markdown", text, markdownHtml, truncated, lineCount };
  }

  if (blob.size > MAX_HIGHLIGHT_FILE_BYTES) {
    return { ...base, kind: "text", text, truncated, lineCount };
  }

  const highlighted = await highlightCode(text, blob.path, theme);
  return {
    ...base,
    kind: "text",
    text: highlighted.highlighted ? null : text,
    html: highlighted.highlighted ? highlighted.html : null,
    highlighted: highlighted.highlighted,
    truncated,
    lineCount,
  };
}

function parentDir(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function contentDisposition(filename: string): string {
  const safe = filename.replace(/[\r\n"\\]/g, "_");
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function isProbablyBinary(blob: FileBlob): boolean {
  return blob.isBinary;
}
