import { describe, expect, it } from "vitest";
import {
  assertValidRef,
  assertValidRevision,
  isForbiddenRefspec,
  isValidRepoName,
  isCommitSha,
} from "@/lib/git/refs";

describe("assertValidRef", () => {
  it.each(["main", "feature/diff-parser", "release/v1.0", "fix_123", "dependabot/npm/foo"])(
    "accepts %s",
    (ref) => {
      expect(assertValidRef(ref)).toBe(ref);
    },
  );

  it.each([
    ["", "empty"],
    ["-upload-pack", "option-like"],
    ["refs/heads/../etc", "traversal"],
    ["a//b", "double slash"],
    ["a b", "space"],
    ["a~b", "tilde"],
    ["a^b", "caret"],
    ["a:b", "colon"],
    ["a?b", "question"],
    ["a*b", "star"],
    ["a[b", "bracket"],
    ["a\\b", "backslash"],
    ["feature@{1}", "reflog syntax"],
    ["foo.lock", "lock suffix"],
    ["foo/", "trailing slash"],
    ["foo.", "trailing dot"],
    ["/foo", "leading slash"],
    ["\u0000main", "NUL"],
    ["a".repeat(256), "too long"],
  ])("rejects %s (%s)", (ref) => {
    expect(() => assertValidRef(ref)).toThrow();
  });

  it("rejects ref segments starting with a dot", () => {
    expect(() => assertValidRef("feature/.hidden")).toThrow();
  });

  it("accepts revisions that are SHAs", () => {
    const sha = "a".repeat(40);
    expect(assertValidRevision(sha)).toBe(sha);
    expect(assertValidRevision("deadbee")).toBe("deadbee");
  });

  it("detects forbidden refspecs", () => {
    expect(isForbiddenRefspec("-o")).toBe(true);
    expect(isForbiddenRefspec("a..b")).toBe(true);
    expect(isForbiddenRefspec("a\\b")).toBe(true);
    expect(isForbiddenRefspec("main")).toBe(false);
  });
});

describe("repository names", () => {
  it("accepts normal names", () => {
    expect(isValidRepoName("keep")).toBe(true);
    expect(isValidRepoName("my_web.app-2")).toBe(true);
  });

  it.each(["", ".", "..", "a b", "a/b", "x.lock", "é"])("rejects %s", (name) => {
    expect(isValidRepoName(name)).toBe(false);
  });
});

describe("isCommitSha", () => {
  it("requires 40 hex characters", () => {
    expect(isCommitSha("a".repeat(40))).toBe(true);
    expect(isCommitSha("a".repeat(39))).toBe(false);
    expect(isCommitSha("z".repeat(40))).toBe(false);
  });
});
