import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFF_LIMITS,
  newPositionForLine,
  parseUnifiedDiff,
  summarizeDiff,
  toSplitRows,
} from "@/lib/git/diff";

const SAMPLE = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 console.log(a, b);
diff --git a/docs/new.md b/docs/new.md
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/docs/new.md
@@ -0,0 +1,2 @@
+# New
+Body
diff --git a/assets/logo.png b/assets/logo.png
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

describe("parseUnifiedDiff", () => {
  const parsed = parseUnifiedDiff(SAMPLE);

  it("finds every file", () => {
    expect(parsed.files.map((file) => file.path)).toEqual([
      "src/app.ts",
      "docs/new.md",
      "assets/logo.png",
    ]);
  });

  it("counts additions and deletions", () => {
    expect(parsed.totalAdditions).toBe(4);
    expect(parsed.totalDeletions).toBe(1);
    expect(parsed.files[0]!.additions).toBe(2);
    expect(parsed.files[0]!.deletions).toBe(1);
  });

  it("marks new files and binary files", () => {
    expect(parsed.files[1]!.status).toBe("added");
    expect(parsed.files[1]!.oldPath).toBeNull();
    expect(parsed.files[2]!.binary).toBe(true);
  });

  it("numbers lines correctly", () => {
    const hunk = parsed.files[0]!.hunks[0]!;
    expect(hunk.oldStart).toBe(1);
    expect(hunk.newStart).toBe(1);
    const deletions = hunk.lines.filter((line) => line.type === "del");
    const additions = hunk.lines.filter((line) => line.type === "add");
    expect(deletions[0]!.oldNumber).toBe(2);
    expect(additions.map((line) => line.newNumber)).toEqual([2, 3]);
    expect(hunk.lines.filter((line) => line.type === "ctx")[0]!.oldNumber).toBe(1);
  });

  it("summarises", () => {
    expect(summarizeDiff(parsed.files)).toEqual({ files: 3, additions: 4, deletions: 1 });
  });

  it("handles renamed files", () => {
    const renamed = parseUnifiedDiff(`diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
`);
    expect(renamed.files[0]!.status).toBe("renamed");
    expect(renamed.files[0]!.path).toBe("new.ts");
  });

  it("never throws on malformed input", () => {
    expect(() => parseUnifiedDiff("@@ nonsense @@\ndiff --git\n")).not.toThrow();
    expect(parseUnifiedDiff("not a diff at all\n").files).toEqual([]);
  });

  it("caps files and marks truncation", () => {
    const huge = Array.from({ length: 5 }).fill(SAMPLE).join("");
    const parsedHuge = parseUnifiedDiff(huge, { ...DEFAULT_DIFF_LIMITS, maxFiles: 2 });
    expect(parsedHuge.files).toHaveLength(2);
    expect(parsedHuge.truncated).toBe(true);
  });

  it("caps lines per file and flags truncation", () => {
    const many = `diff --git a/big.txt b/big.txt
--- a/big.txt
+++ b/big.txt
@@ -1,1 +1,400 @@
${Array.from({ length: 400 }, (_, index) => `+line ${index}`).join("\n")}
`;
    const parsedMany = parseUnifiedDiff(many, { ...DEFAULT_DIFF_LIMITS, maxLinesPerFile: 10 });
    expect(parsedMany.files[0]!.truncated).toBe(true);
    expect(parsedMany.files[0]!.hunks[0]!.lines.length).toBeLessThanOrEqual(10);
  });
});

describe("toSplitRows", () => {
  it("pairs deletions with additions", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const rows = toSplitRows(parsed.files[0]!.hunks[0]!);
    expect(rows[0]!.left?.type).toBe("ctx");
    const changed = rows.find((row) => row.left?.type === "del");
    expect(changed?.right?.type).toBe("add");
    expect(rows.some((row) => row.left === null && row.right?.type === "add")).toBe(true);
  });
});

describe("newPositionForLine", () => {
  it("maps a new-file line to its diff position", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const file = parsed.files[0]!;
    // Hunk order: ctx(1), del, add(2), add(3), ctx(4)
    expect(newPositionForLine(file, 1)).toBe(1);
    expect(newPositionForLine(file, 2)).toBe(3);
    expect(newPositionForLine(file, 3)).toBe(4);
    expect(newPositionForLine(file, 99)).toBeNull();
  });
});
