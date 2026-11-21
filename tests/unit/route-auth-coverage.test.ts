import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fails if a new route handler forgets to authorize.
 *
 * Allowlisted paths are either unauthenticated by design (sign-in, health) or
 * rely on a helper that calls authorize() internally — none of them expose
 * repository data without a permission check.
 */
const ALLOWLIST = new Set([
  "app/healthz/route.ts",
  "app/readyz/route.ts",
  "app/api/auth/login/route.ts",
  "app/api/auth/callback/route.ts",
  "app/api/auth/demo/route.ts",
  "app/api/auth/logout/route.ts",
]);

const HTTP_METHODS =
  /export\s+(async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b|export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*=/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("route authorization coverage", () => {
  const root = process.cwd();
  const files = walk(path.join(root, "app"))
    .filter((file) => file.endsWith(`${path.sep}route.ts`))
    .map((file) => path.relative(root, file).split(path.sep).join("/"));

  it("finds the application's route handlers", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("every handler calls authorize() unless explicitly allowlisted", () => {
    const unguarded = files.filter((file) => {
      if (ALLOWLIST.has(file)) return false;
      const source = readFileSync(path.join(root, file), "utf8");
      if (!HTTP_METHODS.test(source)) return false;
      return !/\bauthorize\s*\(/.test(source);
    });

    expect(unguarded, `Route handlers missing authorize(): ${unguarded.join(", ")}`).toEqual([]);
  });

  it("every API handler obtains an authenticated context", () => {
    const missing = files
      .filter((file) => file.startsWith("app/api/v1/"))
      .filter((file) => {
        const source = readFileSync(path.join(root, file), "utf8");
        return !/apiContext\s*\(/.test(source);
      });
    expect(missing, `Handlers missing apiContext(): ${missing.join(", ")}`).toEqual([]);
  });
});
