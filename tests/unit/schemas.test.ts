import { describe, expect, it } from "vitest";
import {
  createIssueSchema,
  createRepoSchema,
  createReviewSchema,
  pathSchema,
  refSchema,
  reviewCommentSchema,
  updateRepoSchema,
} from "@/lib/schemas";

describe("createRepoSchema", () => {
  it("defaults to a private, initialised repository", () => {
    const parsed = createRepoSchema.parse({ name: "keep" });
    expect(parsed.private).toBe(true);
    expect(parsed.autoInit).toBe(true);
  });

  it("rejects invalid names", () => {
    expect(createRepoSchema.safeParse({ name: "bad name" }).success).toBe(false);
    expect(createRepoSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createRepoSchema.safeParse({ name: "../x" }).success).toBe(false);
  });

  it("rejects unknown gitignore templates", () => {
    expect(createRepoSchema.safeParse({ name: "x", gitignore: "Cobol" }).success).toBe(false);
  });
});

describe("updateRepoSchema", () => {
  it("requires at least one field", () => {
    expect(updateRepoSchema.safeParse({}).success).toBe(false);
    expect(updateRepoSchema.safeParse({ description: "new" }).success).toBe(true);
  });
});

describe("pathSchema", () => {
  it("normalises and rejects traversal", () => {
    expect(pathSchema.parse("src//a.ts")).toBe("src/a.ts");
    expect(pathSchema.safeParse("../etc").success).toBe(false);
    expect(pathSchema.safeParse("a\\b").success).toBe(false);
  });
});

describe("refSchema", () => {
  it("accepts normal refs and rejects hostile ones", () => {
    expect(refSchema.safeParse("feature/x").success).toBe(true);
    expect(refSchema.safeParse("-x").success).toBe(false);
    expect(refSchema.safeParse("a..b").success).toBe(false);
    expect(refSchema.safeParse("a b").success).toBe(false);
  });
});

describe("issue and review schemas", () => {
  it("requires a non-empty issue title", () => {
    expect(createIssueSchema.safeParse({ title: "  " }).success).toBe(false);
    expect(createIssueSchema.safeParse({ title: "Bug" }).success).toBe(true);
  });

  it("requires a line or position for inline comments", () => {
    expect(reviewCommentSchema.safeParse({ path: "a.ts", body: "why" }).success).toBe(false);
    expect(reviewCommentSchema.safeParse({ path: "a.ts", body: "why", line: 4 }).success).toBe(
      true,
    );
  });

  it("validates review events", () => {
    expect(createReviewSchema.safeParse({ event: "APPROVED" }).success).toBe(true);
    expect(createReviewSchema.safeParse({ event: "MERGE" }).success).toBe(false);
  });
});
