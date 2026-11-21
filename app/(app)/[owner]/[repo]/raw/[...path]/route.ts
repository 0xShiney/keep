import { NextResponse, type NextRequest } from "next/server";
import { apiContext, loadRepo, RepoAccessError, toRepoResource } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { badRequest, notFound } from "@/lib/errors";
import { problemFromError, requestIdFrom } from "@/lib/http/problem";
import { assertSameOrigin } from "@/lib/http/request";
import { InvalidPathError, fileName, splitRefPath } from "@/lib/git/path";
import { assertValidRevision, InvalidRefError } from "@/lib/git/refs";
import { contentDisposition } from "@/server/code";

export const dynamic = "force-dynamic";

const INLINE_IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
};

/**
 * Raw bytes for a repository file.
 *
 * Safety rules: only known raster image types are sent inline; everything else
 * is `application/octet-stream` with an attachment disposition, so repository
 * HTML/SVG can never execute on the app origin.
 */
export async function GET(
  request: NextRequest,
  segment: { params: Promise<{ owner: string; repo: string; path: string[] }> },
) {
  const requestId = requestIdFrom(request);
  try {
    assertSameOrigin(request);
    const { owner, repo: repoName, path: rawPath } = await segment.params;
    const { viewer, gateway } = await apiContext();

    const url = new URL(request.url);
    let ref: string;
    let path: string;
    try {
      const split = splitRefPath(rawPath, {
        ref: url.searchParams.get("ref") ?? undefined,
        defaultBranch: (await gateway.getRepo(owner, repoName)).defaultBranch,
      });
      ref = split.ref;
      path = split.path;
    } catch (error) {
      if (error instanceof InvalidPathError) throw badRequest(error.message);
      throw error;
    }
    if (!path) throw badRequest("A file path is required");

    try {
      assertValidRevision(ref);
    } catch (error) {
      if (error instanceof InvalidRefError) throw badRequest(error.message);
      throw error;
    }

    let repo;
    try {
      repo = await loadRepo(gateway, viewer, owner, repoName, "repo:read");
    } catch (error) {
      if (error instanceof RepoAccessError) notFound();
      throw error;
    }
    const decision = authorize(viewer, "repo:read", toRepoResource(repo));
    if (!decision.allowed) throw notFound();

    const upstream = await gateway.getRawFile(owner, repoName, ref, path);
    if (!upstream.ok || !upstream.body) {
      throw notFound();
    }

    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    const imageType = INLINE_IMAGE_TYPES[extension];
    const forceDownload = url.searchParams.get("download") === "1";
    const inline = Boolean(imageType) && !forceDownload;

    const headers = new Headers({
      "content-type": imageType ?? "application/octet-stream",
      "content-disposition": inline
        ? `inline; filename="${fileName(path).replace(/["\\\r\n]/g, "_")}"`
        : contentDisposition(fileName(path)),
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=60",
      "content-security-policy": "default-src 'none'; sandbox",
      "referrer-policy": "no-referrer",
      "x-request-id": requestId,
    });

    const length = upstream.headers.get("content-length");
    if (length) headers.set("content-length", length);

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    return problemFromError(error, requestId);
  }
}

/** Raw endpoints are read-only. */
export async function POST() {
  return NextResponse.json(
    {
      title: "Method not allowed",
      status: 405,
      type: "https://keep.local/problems/method-not-allowed",
    },
    { status: 405, headers: { allow: "GET", "cache-control": "no-store" } },
  );
}
