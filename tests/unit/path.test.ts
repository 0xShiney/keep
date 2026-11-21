import { describe, expect, it } from "vitest";
import {
  decodePathSegments,
  fileName,
  isMarkdownPath,
  isSafePreviewImage,
  normalizeRepoPath,
  parentPath,
} from "@/lib/git/path";

describe("normalizeRepoPath", () => {
  it("normalises separators and empty segments", () => {
    expect(normalizeRepoPath("src//lib/diff.ts")).toBe("src/lib/diff.ts");
    expect(normalizeRepoPath("/")).toBe("");
    expect(normalizeRepoPath("")).toBe("");
  });

  it("rejects dot segments rather than resolving them", () => {
    expect(() => normalizeRepoPath("src/lib/./diff.ts")).toThrow();
    expect(() => normalizeRepoPath("./README.md")).toThrow();
  });

  it("joins segment arrays", () => {
    expect(normalizeRepoPath(["src", "lib", "diff.ts"])).toBe("src/lib/diff.ts");
  });

  it.each([
    "../etc/passwd",
    "src/../../etc/passwd",
    "..",
    "a/./../../b",
    "./x",
    "a\u0000b",
    "a\\b",
    "/etc/passwd",
    "a\u0001b",
    "x".repeat(1025),
  ])("rejects %j", (value) => {
    expect(() => normalizeRepoPath(value)).toThrow();
  });

  it("rejects overlong segments", () => {
    expect(() => normalizeRepoPath("a".repeat(256))).toThrow();
  });
});

describe("decodePathSegments", () => {
  it("decodes percent-encoding once", () => {
    expect(decodePathSegments(["src", "my%20file.ts"])).toBe("src/my file.ts");
    expect(decodePathSegments(["src%2Flib"])).toBe("src/lib");
  });

  it("rejects malformed escapes", () => {
    expect(() => decodePathSegments(["%E0%A4%A"])).toThrow();
  });

  it("rejects encoded traversal", () => {
    expect(() => decodePathSegments(["%2e%2e", "etc"])).toThrow();
  });
});

describe("path helpers", () => {
  it("derives names and parents", () => {
    expect(fileName("docs/DESIGN.md")).toBe("DESIGN.md");
    expect(parentPath("docs/DESIGN.md")).toBe("docs");
    expect(parentPath("README.md")).toBe("");
  });

  it("detects markdown and safe images", () => {
    expect(isMarkdownPath("README.md")).toBe(true);
    expect(isMarkdownPath("notes.txt")).toBe(false);
    expect(isSafePreviewImage("logo.png")).toBe(true);
    expect(isSafePreviewImage("logo.svg")).toBe(false);
  });
});
