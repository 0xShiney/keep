import { notFound } from "next/navigation";
import { createGateway } from "@/lib/forgejo";
import { ForgejoApiError } from "@/lib/forgejo/client";
import type { ForgejoGateway } from "@/lib/forgejo/gateway";
import type { RepoSummary } from "@/lib/forgejo/model";
import { authorize, type Action, type RepoResource, type Viewer } from "@/lib/auth/authorize";
import { asViewer, requireApiIdentity, requireIdentity } from "@/lib/auth/current";
import type { Identity } from "@/lib/auth/session";
import { forbidden, notFound as notFoundProblem } from "@/lib/errors";

export interface PageContext {
  identity: Identity;
  viewer: Viewer;
  gateway: ForgejoGateway;
}

export type ApiContext = PageContext;

function build(identity: Identity): PageContext {
  return {
    identity,
    viewer: asViewer(identity),
    gateway: createGateway(identity.username, identity.accessToken),
  };
}

/** Page-level context: redirects to /login when unauthenticated. */
export async function pageContext(nextPath?: string): Promise<PageContext> {
  const identity = await requireIdentity(nextPath);
  return build(identity);
}

/** API-level context: throws a 401 problem instead of redirecting. */
export async function apiContext(): Promise<ApiContext> {
  const identity = await requireApiIdentity();
  return build(identity);
}

export function toRepoResource(repo: RepoSummary): RepoResource {
  return {
    kind: "repo",
    owner: repo.owner,
    name: repo.name,
    private: repo.private,
    permissions: repo.permissions,
  };
}

export class RepoAccessError extends Error {
  constructor(
    readonly kind: "not_found" | "forbidden",
    message: string,
  ) {
    super(message);
    this.name = "RepoAccessError";
  }
}

/**
 * Loads a repository and enforces authorization in one step.
 *
 * Unauthorized repositories report "not found" rather than "forbidden" so the
 * app never confirms the existence of a private repository to a viewer who
 * cannot read it.
 */
export async function loadRepo(
  gateway: ForgejoGateway,
  viewer: Viewer,
  owner: string,
  name: string,
  action: Action = "repo:read",
): Promise<RepoSummary> {
  let repo: RepoSummary;
  try {
    repo = await gateway.getRepo(owner, name);
  } catch (error) {
    if (error instanceof ForgejoApiError && error.status === 404) {
      throw new RepoAccessError("not_found", `Repository ${owner}/${name} was not found`);
    }
    throw error;
  }

  const decision = authorize(viewer, action, toRepoResource(repo));
  if (!decision.allowed) {
    throw new RepoAccessError("not_found", `Repository ${owner}/${name} was not found`);
  }

  return repo;
}

/** Page variant: converts access errors into Next's 404 boundary. */
export async function loadRepoForPage(
  gateway: ForgejoGateway,
  viewer: Viewer,
  owner: string,
  name: string,
  action: Action = "repo:read",
): Promise<RepoSummary> {
  try {
    return await loadRepo(gateway, viewer, owner, name, action);
  } catch (error) {
    if (error instanceof RepoAccessError) notFound();
    throw error;
  }
}

/** API variant: 404 for missing, 403 only when the resource is known-visible. */
export function repoAccessProblem(error: unknown): never {
  if (error instanceof RepoAccessError) {
    if (error.kind === "not_found") throw notFoundProblem(error.message);
    throw forbidden(error.message);
  }
  throw error;
}

/** Loads a repository for an API handler, converting access errors to problems. */
export async function repoForApi(
  gateway: ForgejoGateway,
  viewer: Viewer,
  owner: string,
  name: string,
  action: Action,
): Promise<RepoSummary> {
  try {
    return await loadRepo(gateway, viewer, owner, name, action);
  } catch (error) {
    repoAccessProblem(error);
  }
}
