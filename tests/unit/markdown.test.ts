import { describe, expect, it } from "vitest";
import { plainSummary, renderMarkdown } from "@/lib/render/markdown";

describe("renderMarkdown", () => {
  it("renders GFM", async () => {
    const html = await renderMarkdown("# Title\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<table>");
  });

  it("renders task lists", async () => {
    const html = await renderMarkdown("- [x] done\n- [ ] todo");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it.each([
    ["<script>alert(1)</script>", "script"],
    ["<img src=x onerror=alert(1)>", "onerror"],
    ["<iframe src=https://evil.example></iframe>", "iframe"],
    ['<a href="javascript:alert(1)">x</a>', "javascript:"],
    ["[x](javascript:alert(1))", "javascript:"],
    ['<div style="position:fixed">x</div>', "position:fixed"],
  ])("strips XSS payload %s", async (payload, needle) => {
    const html = await renderMarkdown(payload);
    expect(html.toLowerCase()).not.toContain(needle.toLowerCase());
  });

  it("keeps safe links but adds rel on external ones", async () => {
    const html = await renderMarkdown("[external](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("rewrites relative links against the repository base", async () => {
    const html = await renderMarkdown("[guide](docs/GUIDE.md)", {
      linkBase: "/ada/keep/blob/main",
      rawBase: "/ada/keep/raw/main",
    });
    expect(html).toContain('href="/ada/keep/blob/main/docs/GUIDE.md"');
  });

  it("drops relative links that try to escape the repository", async () => {
    const html = await renderMarkdown("[bad](../../etc/passwd)", {
      linkBase: "/ada/keep/blob/main",
    });
    expect(html).not.toContain("etc/passwd");
  });

  it("rewrites image sources", async () => {
    const html = await renderMarkdown("![logo](assets/logo.png)", {
      linkBase: "/ada/keep/blob/main",
      rawBase: "/ada/keep/raw/main",
    });
    expect(html).toContain('src="/ada/keep/raw/main/assets/logo.png"');
    expect(html).toContain('loading="lazy"');
  });

  it("caches identical renders", async () => {
    const first = await renderMarkdown("same content");
    const second = await renderMarkdown("same content");
    expect(second).toBe(first);
  });
});

describe("plainSummary", () => {
  it("strips markup and truncates", () => {
    expect(plainSummary("# Title\n\nSome **bold** text")).toBe("Title Some bold text");
    expect(plainSummary("word ".repeat(100)).length).toBeLessThanOrEqual(140);
  });
});
