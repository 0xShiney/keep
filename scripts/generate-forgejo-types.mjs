#!/usr/bin/env node
/**
 * Regenerates lib/forgejo/schema.d.ts from the committed Forgejo spec.
 *
 * openapi-typescript needs OpenAPI 3, so the Swagger 2 document is converted with
 * swagger2openapi first. Both tools run through npx at pinned major versions; the
 * output is committed so builds never depend on the network.
 *
 * Usage: node scripts/generate-forgejo-types.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cwd = process.cwd();
const specPath = path.join(cwd, "lib/forgejo/forgejo-swagger.v1.json");
const outPath = path.join(cwd, "lib/forgejo/schema.d.ts");
const work = mkdtempSync(path.join(tmpdir(), "forgejo-"));

const spec = JSON.parse(readFileSync(specPath, "utf8"));
if (!spec.swagger) {
  console.error(`${specPath} is not a Swagger 2 document (missing "swagger" key).`);
  process.exit(1);
}

const openapi3 = path.join(work, "openapi3.json");
console.log(`Converting ${spec.info.version} (Swagger 2 -> OpenAPI 3)…`);
execFileSync("npx", ["--yes", "swagger2openapi@7", specPath, "-o", openapi3], {
  stdio: "inherit",
});

console.log("Generating TypeScript types…");
const generated = execFileSync("npx", ["--yes", "openapi-typescript@7", openapi3], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

const header = `/**
 * Generated from lib/forgejo/forgejo-swagger.v1.json (Forgejo ${spec.info.version}).
 * Do not edit by hand: run \`pnpm forgejo:types\`.
 */
`;
writeFileSync(outPath, header + generated);
console.log(`Wrote ${outPath}`);
