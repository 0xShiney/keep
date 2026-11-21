import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract test against the committed Forgejo 15.0.12 Swagger document.
 *
 * Every endpoint Keep calls is listed here. If Forgejo renames or removes one,
 * this test fails before the app ships a broken call — which is the whole reason
 * the spec is committed alongside the generated types.
 */

interface SwaggerDoc {
  info: { version: string; title: string };
  paths: Record<string, Record<string, unknown>>;
}

const specPath = path.join(process.cwd(), "lib/forgejo/forgejo-swagger.v1.json");
const spec = JSON.parse(readFileSync(specPath, "utf8")) as SwaggerDoc;

const REQUIRED: [string, ("get" | "post" | "patch" | "delete" | "put")[]][] = [
  ["/user", ["get"]],
  ["/user/repos", ["get", "post"]],
  ["/repos/search", ["get"]],
  ["/repos/{owner}/{repo}", ["get", "patch", "delete"]],
  ["/repos/{owner}/{repo}/branches", ["get", "post"]],
  ["/repos/{owner}/{repo}/branches/{branch}", ["delete"]],
  ["/repos/{owner}/{repo}/tags", ["get", "post"]],
  ["/repos/{owner}/{repo}/tags/{tag}", ["delete"]],
  ["/repos/{owner}/{repo}/contents/{filepath}", ["get"]],
  ["/repos/{owner}/{repo}/raw/{filepath}", ["get"]],
  ["/repos/{owner}/{repo}/commits", ["get"]],
  ["/repos/{owner}/{repo}/git/commits/{sha}", ["get"]],
  ["/repos/{owner}/{repo}/git/commits/{sha}.{diffType}", ["get"]],
  ["/repos/{owner}/{repo}/compare/{basehead}", ["get"]],
  ["/repos/{owner}/{repo}/languages", ["get"]],
  ["/repos/{owner}/{repo}/issues", ["get", "post"]],
  ["/repos/{owner}/{repo}/issues/{index}", ["get", "patch"]],
  ["/repos/{owner}/{repo}/issues/{index}/comments", ["get", "post"]],
  ["/repos/{owner}/{repo}/issues/{index}/timeline", ["get"]],
  ["/repos/{owner}/{repo}/pulls", ["get", "post"]],
  ["/repos/{owner}/{repo}/pulls/{index}", ["get"]],
  ["/repos/{owner}/{repo}/pulls/{index}.{diffType}", ["get"]],
  ["/repos/{owner}/{repo}/pulls/{index}/commits", ["get"]],
  ["/repos/{owner}/{repo}/pulls/{index}/files", ["get"]],
  ["/repos/{owner}/{repo}/pulls/{index}/merge", ["post"]],
  ["/repos/{owner}/{repo}/pulls/{index}/reviews", ["get", "post"]],
  ["/repos/{owner}/{repo}/pulls/{index}/reviews/{id}/comments", ["get"]],
  ["/repos/{owner}/{repo}/releases", ["get", "post"]],
  ["/user/keys", ["get", "post"]],
  ["/user/keys/{id}", ["delete"]],
  ["/users/{username}/tokens", ["get", "post"]],
  ["/users/{username}/tokens/{token}", ["delete"]],
  ["/users/{username}/activities/feeds", ["get"]],
];

describe("Forgejo contract", () => {
  it("is the pinned 15.0.x spec", () => {
    expect(spec.info.version).toMatch(/^15\.0\./);
  });

  it.each(REQUIRED)("%s exposes %s", (endpoint, methods) => {
    const entry = spec.paths[endpoint];
    expect(entry, `Missing endpoint ${endpoint}`).toBeDefined();
    for (const method of methods) {
      expect(entry?.[method], `Missing ${method.toUpperCase()} ${endpoint}`).toBeDefined();
    }
  });

  it("keeps the generated types in sync with the spec version", () => {
    const types = readFileSync(path.join(process.cwd(), "lib/forgejo/schema.d.ts"), "utf8");
    expect(types).toContain(`Forgejo ${spec.info.version}`);
  });
});
