import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsp, STYLE_SRC } from "@/lib/security/csp";

function directive(csp: string, name: string): string {
  const found = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) throw new Error(`Missing directive ${name}`);
  return found;
}

describe("CSP", () => {
  it("locks scripts to a per-request nonce with strict-dynamic", () => {
    const csp = buildCsp("nonce-value", false);
    expect(directive(csp, "script-src")).toBe(
      "script-src 'self' 'nonce-nonce-value' 'strict-dynamic'",
    );
    expect(directive(csp, "script-src")).not.toContain("unsafe-inline");
    expect(directive(csp, "script-src")).not.toContain("unsafe-eval");
  });

  it("never allows unsafe-eval in production", () => {
    expect(buildCsp("n", false)).not.toContain("unsafe-eval");
    expect(buildCsp("n", true)).toContain("unsafe-eval");
  });

  it("denies framing, objects, base and external form posts", () => {
    const csp = buildCsp("n", false);
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'none'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
  });

  it("upgrades insecure requests only in production", () => {
    expect(buildCsp("n", false)).toContain("upgrade-insecure-requests");
    expect(buildCsp("n", true)).not.toContain("upgrade-insecure-requests");
  });

  it("keeps the single style-src exception and documents its removal plan", () => {
    expect(directive(buildCsp("n", false), "style-src")).toBe(STYLE_SRC);

    const decisions = readFileSync(path.join(process.cwd(), "docs", "DECISIONS.md"), "utf8");
    const entry = decisions.slice(decisions.indexOf("## D-011"));
    expect(entry).toContain(STYLE_SRC);
    expect(entry).toMatch(/Removal plan/i);
    expect(entry).toMatch(/Review trigger/i);
  });
});
