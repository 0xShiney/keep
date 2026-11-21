import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ForgejoApiError } from "@/lib/forgejo/client";
import { AppError } from "@/lib/errors";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "api" });

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  requestId: string;
  [key: string]: unknown;
}

export function requestIdFrom(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  if (incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming)) return incoming;
  return randomUUID();
}

export function problem(
  status: number,
  title: string,
  detail: string | undefined = undefined,
  options: {
    requestId: string;
    type?: string;
    headers?: HeadersInit;
    extra?: Record<string, unknown>;
  } = { requestId: randomUUID() },
): NextResponse {
  const body: ProblemBody = {
    type: options.type ?? `https://keep.local/problems/${slug(title)}`,
    title,
    status,
    requestId: options.requestId,
    ...(detail ? { detail } : {}),
    ...options.extra,
  };

  const headers = new Headers(options.headers);
  headers.set("content-type", "application/problem+json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-request-id", options.requestId);

  return NextResponse.json(body, { status, headers });
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Maps any thrown value to a problem response without leaking internals. */
export function problemFromError(error: unknown, requestId: string): NextResponse {
  if (error instanceof AppError) {
    return problem(error.status, error.title, error.detail, {
      requestId,
      type: `https://keep.local/problems/${slug(error.title)}`,
      extra: error.errors ? { errors: error.errors } : undefined,
    });
  }

  if (error instanceof ForgejoApiError) {
    const notFound = error.status === 404;
    const conflictStatus = error.status === 409 || error.status === 422;
    if (notFound)
      return problem(404, "Not found", "The Git engine does not have this resource.", {
        requestId,
      });
    if (conflictStatus) {
      return problem(409, "Conflict", "The Git engine rejected this change.", { requestId });
    }
    if (error.status === 401 || error.status === 403) {
      log.warn({ requestId, status: error.status }, "forgejo denied request");
      return problem(403, "Forbidden", "The Git engine denied access.", { requestId });
    }
    log.error({ requestId, status: error.status, path: error.path }, "forgejo upstream error");
    return problem(502, "Upstream error", "The Git engine request failed.", { requestId });
  }

  if (error instanceof SyntaxError) {
    return problem(400, "Bad request", "Malformed JSON body.", { requestId });
  }

  log.error(
    { requestId, err: error instanceof Error ? error.message : String(error) },
    "unhandled api error",
  );
  return problem(500, "Internal server error", "Something went wrong. Quote the request id.", {
    requestId,
  });
}

export function jsonResponse<T>(
  data: T,
  options: { status?: number; requestId: string; headers?: HeadersInit; cache?: string },
): NextResponse {
  const headers = new Headers(options.headers);
  headers.set("x-request-id", options.requestId);
  headers.set("cache-control", options.cache ?? "no-store");
  return NextResponse.json(data, { status: options.status ?? 200, headers });
}
