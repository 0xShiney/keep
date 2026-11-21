import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Download, FileWarning, History } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CodeEmpty, HighlightedCode, PlainCode } from "@/components/code-view";
import { CopyButton } from "@/components/copy-button";
import { MarkdownFileView } from "@/components/markdown-file-view";
import { RefSwitcher } from "@/components/ref-switcher";
import { RepoHeader } from "@/components/repo-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineNotice } from "@/components/ui/feedback";
import { assertValidRevision, InvalidRefError } from "@/lib/git/refs";
import { InvalidPathError, splitRefPath } from "@/lib/git/path";
import { getThemePref } from "@/lib/theme";
import { formatBytes } from "@/lib/utils";
import { loadRepoForPage, pageContext } from "@/server/context";
import { loadFileView, MAX_HIGHLIGHT_FILE_BYTES, MAX_VIEW_FILE_BYTES } from "@/server/code";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
}): Promise<Metadata> {
  const { owner, repo, path } = await params;
  return { title: `${owner}/${repo}/${path.join("/")}` };
}

export default async function BlobPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { owner, repo: repoName, path: rawPath } = await params;
  const { ref: requestedRef } = await searchParams;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/blob`);

  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:read");

  let ref: string;
  let path: string;
  try {
    const split = splitRefPath(rawPath, {
      ref: requestedRef,
      defaultBranch: repo.defaultBranch,
    });
    ref = split.ref;
    path = split.path;
  } catch (error) {
    if (error instanceof InvalidPathError) notFound();
    throw error;
  }
  if (!path) notFound();

  try {
    assertValidRevision(ref);
  } catch (error) {
    if (error instanceof InvalidRefError) notFound();
    throw error;
  }

  const theme = await getThemePref();
  const [branches, tags, file] = await Promise.all([
    gateway.listBranches(owner, repoName).catch(() => []),
    gateway.listTags(owner, repoName).catch(() => []),
    loadFileView(gateway, owner, repoName, ref, path, theme),
  ]);

  const encodedRef = encodeURIComponent(ref);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const rawHref = `/${owner}/${repoName}/raw/${encodedRef}/${encodedPath}`;

  return (
    <div>
      <RepoHeader repo={repo} active="code" />

      <div className="flex flex-wrap items-center gap-2 pb-3">
        <RefSwitcher
          owner={owner}
          repo={repoName}
          current={ref}
          branches={branches}
          tags={tags}
          mode="blob"
          path={path}
        />
        <Breadcrumbs owner={owner} repo={repoName} gitRef={ref} path={path} mode="blob" />
      </div>

      <div className="border-border bg-surface-1 overflow-hidden rounded-md border">
        <div className="border-border bg-surface-2/50 flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
          <span className="text-fg min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
          {file.kind === "too-large" ? <Badge tone="warning">large file</Badge> : null}
          {file.truncated ? <Badge tone="warning">truncated</Badge> : null}
          {file.kind === "binary" ? <Badge tone="neutral">binary</Badge> : null}
          <span className="text-2xs text-fg-subtle">
            {formatBytes(file.size)}
            {file.lineCount > 0 ? ` · ${file.lineCount} lines` : ""}
          </span>
          <div className="flex items-center gap-0.5">
            <CopyButton value={path} label="Copy file path" />
            <ButtonLink
              href={`/${owner}/${repoName}/commits?ref=${encodedRef}&path=${encodeURIComponent(path)}`}
              variant="ghost"
              size="icon-sm"
              aria-label="File history"
              title="File history"
            >
              <History aria-hidden="true" />
            </ButtonLink>
            <ButtonLink
              href={rawHref}
              variant="ghost"
              size="sm"
              aria-label="View raw file"
              title="View raw file"
            >
              Raw
            </ButtonLink>
            <ButtonLink
              href={`${rawHref}?download=1`}
              variant="ghost"
              size="icon-sm"
              aria-label="Download file"
              title="Download file"
            >
              <Download aria-hidden="true" />
            </ButtonLink>
          </div>
        </div>

        {file.kind === "too-large" ? (
          <div className="px-4 py-6">
            <InlineNotice tone="warning">
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <FileWarning aria-hidden="true" className="size-3.5" />
                  This file is larger than {formatBytes(MAX_VIEW_FILE_BYTES)}.
                </span>
                <span>
                  It is not loaded into the browser. Download it instead:
                  <a href={`${rawHref}?download=1`} className="ml-1 underline underline-offset-2">
                    {file.name}
                  </a>
                </span>
              </span>
            </InlineNotice>
          </div>
        ) : file.kind === "binary" ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <FileWarning aria-hidden="true" className="text-fg-subtle size-5" />
            <p className="text-fg text-sm">Binary file</p>
            <p className="text-fg-subtle text-xs">
              {formatBytes(file.size)} · not rendered in the browser.
            </p>
            <ButtonLink href={`${rawHref}?download=1`} variant="secondary" size="sm">
              <Download aria-hidden="true" />
              Download
            </ButtonLink>
          </div>
        ) : file.kind === "image" ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6">
            {/* Safe raster formats only; SVG and HTML are never rendered inline. */}
            <img
              src={rawHref}
              alt={file.name}
              className="border-border bg-surface-2 max-h-[60vh] max-w-full rounded-sm border"
            />
            <p className="text-2xs text-fg-subtle">
              Raster preview. SVG and HTML files are served as downloads only.
            </p>
          </div>
        ) : file.kind === "markdown" && file.markdownHtml ? (
          <MarkdownFileView markdownHtml={file.markdownHtml} rawContent={file.text ?? ""} />
        ) : file.size > MAX_HIGHLIGHT_FILE_BYTES ? (
          <div>
            <div className="border-border bg-warning-subtle text-2xs text-warning border-b px-3 py-1.5">
              <span className="flex items-center gap-1.5">
                <AlertTriangle aria-hidden="true" className="size-3" />
                Highlighting is skipped above {formatBytes(MAX_HIGHLIGHT_FILE_BYTES)}. Showing plain
                text.
              </span>
            </div>
            <PlainCode text={file.text ?? ""} />
          </div>
        ) : file.html ? (
          <HighlightedCode html={file.html} />
        ) : file.text !== null && file.text !== "" ? (
          <PlainCode text={file.text} />
        ) : (
          <CodeEmpty />
        )}
      </div>

      <p className="text-2xs text-fg-subtle mt-2">
        Rendered on the server with theme <span className="font-mono">{theme}</span>. Line anchors
        look like <span className="font-mono">#L12</span>.{" "}
        <Link href={rawHref} className="text-fg-muted underline underline-offset-2">
          Raw view
        </Link>
      </p>
    </div>
  );
}
