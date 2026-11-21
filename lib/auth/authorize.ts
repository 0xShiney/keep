import type { RepoPermissions } from "@/lib/forgejo/model";

/**
 * The single authorization decision point.
 *
 * Every route handler and every server action calls authorize(), and a unit test
 * fails if a handler file does not reference it. Deny by default: an unknown
 * action, a missing identity, or a missing permission all return `false`.
 *
 * Two independent layers protect private repositories:
 *   1. this function, using permissions Forgejo reported for the viewer;
 *   2. Forgejo itself, which rejects the API call if the token lacks access.
 */

export type Action =
  | "repo:read"
  | "repo:write"
  | "repo:admin"
  | "issue:read"
  | "issue:write"
  | "pull:read"
  | "pull:write"
  | "pull:merge"
  | "pull:review"
  | "release:read"
  | "release:write"
  | "tag:read"
  | "tag:write"
  | "account:read"
  | "account:write"
  | "settings:admin";

export interface RepoResource {
  kind: "repo";
  owner: string;
  name: string;
  private: boolean;
  permissions: RepoPermissions;
}

export interface AccountResource {
  kind: "account";
  userId: number;
}

export interface SystemResource {
  kind: "system";
}

export type Resource = RepoResource | AccountResource | SystemResource;

export interface Viewer {
  userId: number;
  username: string;
  isOwner: boolean;
}

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: "unauthenticated" | "forbidden" | "unknown_action" };

const REPO_READ_ACTIONS: ReadonlySet<Action> = new Set([
  "repo:read",
  "issue:read",
  "pull:read",
  "release:read",
  "tag:read",
]);

const REPO_WRITE_ACTIONS: ReadonlySet<Action> = new Set([
  "repo:write",
  "issue:write",
  "pull:write",
  "pull:merge",
  "pull:review",
  "release:write",
  "tag:write",
]);

const ALL_ACTIONS: ReadonlySet<Action> = new Set([
  ...REPO_READ_ACTIONS,
  ...REPO_WRITE_ACTIONS,
  "repo:admin",
  "account:read",
  "account:write",
  "settings:admin",
]);

export function authorize(viewer: Viewer | null, action: Action, resource: Resource): Decision {
  if (!ALL_ACTIONS.has(action)) return { allowed: false, reason: "unknown_action" };
  if (!viewer) return { allowed: false, reason: "unauthenticated" };

  switch (resource.kind) {
    case "system":
      return viewer.isOwner ? { allowed: true } : { allowed: false, reason: "forbidden" };

    case "account":
      return viewer.userId === resource.userId
        ? { allowed: true }
        : { allowed: false, reason: "forbidden" };

    case "repo": {
      // The app is single-owner: every viewer must be authenticated (checked
      // above) and Forgejo must have granted the matching permission.
      if (action === "repo:admin") {
        return resource.permissions.admin
          ? { allowed: true }
          : { allowed: false, reason: "forbidden" };
      }
      if (REPO_READ_ACTIONS.has(action)) {
        return resource.permissions.pull
          ? { allowed: true }
          : { allowed: false, reason: "forbidden" };
      }
      if (REPO_WRITE_ACTIONS.has(action)) {
        return resource.permissions.push
          ? { allowed: true }
          : { allowed: false, reason: "forbidden" };
      }
      return { allowed: false, reason: "unknown_action" };
    }

    default:
      return { allowed: false, reason: "forbidden" };
  }
}

export function assertAuthorized(viewer: Viewer | null, action: Action, resource: Resource): void {
  const decision = authorize(viewer, action, resource);
  if (!decision.allowed) {
    const error = new Error(`Not authorized for ${action}`);
    error.name = decision.reason === "unauthenticated" ? "UnauthenticatedError" : "ForbiddenError";
    throw error;
  }
}
