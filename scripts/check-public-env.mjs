#!/usr/bin/env node
/**
 * Fails the build if server-side configuration leaked into the client bundle.
 *
 * Checks every JS chunk under .next/static for the *values* of server-only env
 * variables, and for the names of secrets that should never be referenced from
 * client code. Run after `pnpm build` (CI runs it before deploying).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const STATIC_DIR = path.join(process.cwd(), ".next/static");
const SERVER_ONLY_NAMES = [
  "FORGEJO_CLIENT_SECRET",
  "FORGEJO_ADMIN_TOKEN",
  "SESSION_SECRET",
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
  "RESTIC_PASSWORD",
  "AWS_SECRET_ACCESS_KEY",
  "KEEP_OWNER_PASSWORD",
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".js")) out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(STATIC_DIR);
} catch {
  console.error("No .next/static found — run `pnpm build` first.");
  process.exit(1);
}

const values = SERVER_ONLY_NAMES.map((name) => process.env[name]).filter(
  (value) => value && value.length >= 12,
);

const findings = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const name of SERVER_ONLY_NAMES) {
    if (source.includes(name)) findings.push(`${path.relative(process.cwd(), file)}: name ${name}`);
  }
  for (const value of values) {
    if (source.includes(value)) {
      findings.push(`${path.relative(process.cwd(), file)}: value of a server-only variable`);
    }
  }
}

if (findings.length > 0) {
  console.error("Server-only configuration found in the client bundle:");
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(`Scanned ${files.length} client chunks: no server-only configuration found.`);
