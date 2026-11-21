import { describe, expect, it } from "vitest";
import { authorize, type RepoResource, type Viewer } from "@/lib/auth/authorize";

const owner: Viewer = { userId: 1, username: "ada", isOwner: true };
const other: Viewer = { userId: 2, username: "bob", isOwner: false };

const privateRepo: RepoResource = {
  kind: "repo",
  owner: "ada",
  name: "keep",
  private: true,
  permissions: { admin: true, push: true, pull: true },
};

const readOnlyRepo: RepoResource = {
  ...privateRepo,
  permissions: { admin: false, push: false, pull: true },
};

const writeOnlyRepo: RepoResource = {
  ...privateRepo,
  permissions: { admin: false, push: true, pull: true },
};

describe("authorize", () => {
  it("denies everything without an identity", () => {
    expect(authorize(null, "repo:read", privateRepo)).toEqual({
      allowed: false,
      reason: "unauthenticated",
    });
  });

  it("denies unknown actions", () => {
    expect(authorize(owner, "repo:destroy" as never, privateRepo)).toEqual({
      allowed: false,
      reason: "unknown_action",
    });
  });

  it("allows reads with pull permission", () => {
    expect(authorize(owner, "repo:read", readOnlyRepo).allowed).toBe(true);
    expect(authorize(owner, "issue:read", readOnlyRepo).allowed).toBe(true);
  });

  it("denies writes without push permission", () => {
    expect(authorize(owner, "repo:write", readOnlyRepo)).toEqual({
      allowed: false,
      reason: "forbidden",
    });
    expect(authorize(owner, "pull:merge", readOnlyRepo).allowed).toBe(false);
  });

  it("allows writes with push permission", () => {
    expect(authorize(owner, "repo:write", writeOnlyRepo).allowed).toBe(true);
    expect(authorize(owner, "pull:merge", writeOnlyRepo).allowed).toBe(true);
  });

  it("requires admin permission for admin actions", () => {
    expect(authorize(owner, "repo:admin", writeOnlyRepo).allowed).toBe(false);
    expect(authorize(owner, "repo:admin", privateRepo).allowed).toBe(true);
  });

  it("scopes account actions to the same user", () => {
    expect(authorize(owner, "account:read", { kind: "account", userId: 1 }).allowed).toBe(true);
    expect(authorize(owner, "account:read", { kind: "account", userId: 2 }).allowed).toBe(false);
    expect(authorize(other, "account:write", { kind: "account", userId: 2 }).allowed).toBe(true);
  });

  it("only allows owners to act on the system", () => {
    expect(authorize(owner, "repo:write", { kind: "system" }).allowed).toBe(true);
    expect(authorize(other, "repo:write", { kind: "system" }).allowed).toBe(false);
  });
});
