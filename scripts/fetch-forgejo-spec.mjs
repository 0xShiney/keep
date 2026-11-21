#!/usr/bin/env node
/**
 * Downloads the OpenAPI (Swagger v2) document for the pinned Forgejo release and
 * commits it to lib/forgejo/. Types in lib/forgejo/schema.d.ts are generated from
 * this file, so it must match the image digest in deploy/images.lock.
 *
 * Forgejo ships the document as a Go template (version and URL are substituted at
 * runtime), so the few template expressions are filled with the pinned values.
 *
 * Usage: node scripts/fetch-forgejo-spec.mjs [tag]
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const TAG = process.argv[2] ?? process.env.FORGEJO_VERSION ?? "v15.0.12";
const VERSION = TAG.replace(/^v/, "");
const SOURCE = `https://codeberg.org/forgejo/forgejo/raw/tag/${TAG}/templates/swagger/v1_json.tmpl`;
const TARGET = path.join(process.cwd(), "lib/forgejo/forgejo-swagger.v1.json");

const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`Failed to download ${SOURCE}: HTTP ${response.status}`);
  process.exit(1);
}

let text = await response.text();
text = text
  .replaceAll("{{AppVer | JSEscape}}", VERSION)
  .replaceAll("{{AppSubUrl | JSEscape}}", "")
  .replaceAll("{{.SwaggerAppSubUrl}}", "");

let spec;
try {
  spec = JSON.parse(text);
} catch (error) {
  console.error("Downloaded document is not valid JSON. Forgejo's template may have changed.");
  console.error(error.message);
  process.exit(1);
}

if (!spec.paths || Object.keys(spec.paths).length < 100) {
  console.error(`Unexpected spec: ${Object.keys(spec.paths ?? {}).length} paths`);
  process.exit(1);
}
if (spec.info?.version !== VERSION) {
  console.error(`Version mismatch: expected ${VERSION}, got ${spec.info?.version}`);
  process.exit(1);
}

await writeFile(TARGET, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Wrote ${TARGET}`);
console.log(`  source:  ${SOURCE}`);
console.log(`  version: ${spec.info.version}`);
console.log(`  paths:   ${Object.keys(spec.paths).length}`);
