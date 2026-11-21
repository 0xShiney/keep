import { describe, expect, it } from "vitest";
import { wordDiff } from "@/lib/git/word-diff";

describe("wordDiff", () => {
  it("marks only the changed token", () => {
    const result = wordDiff("const value = 1;", "const value = 2;");
    expect(result.old.filter((segment) => segment.changed).map((s) => s.value.trim())).toContain(
      "1;",
    );
    expect(result.next.filter((segment) => segment.changed).map((s) => s.value.trim())).toContain(
      "2;",
    );
    expect(result.next.map((s) => s.value).join("")).toBe("const value = 2;");
  });

  it("keeps identical lines unchanged", () => {
    const result = wordDiff("hello world", "hello world");
    expect(result.old.every((segment) => !segment.changed)).toBe(true);
    expect(result.next).toEqual([{ value: "hello world", changed: false }]);
  });

  it("handles insertions", () => {
    const result = wordDiff("a b", "a x b");
    expect(result.next.map((s) => s.value).join("")).toBe("a x b");
  });

  it("bails out on pathological lines", () => {
    const long = "x".repeat(3000);
    const result = wordDiff(long, `${long}y`);
    expect(result.old).toEqual([{ value: long, changed: false }]);
  });
});
