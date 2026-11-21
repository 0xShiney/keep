#!/usr/bin/env node
/**
 * Minimal, dependency-free SQL migrator.
 *
 * Applies db/migrations/*.sql in filename order inside a transaction each, and
 * records applied files in keep_migrations. Keeping migrations as plain SQL (and
 * this runner free of the ORM) means the web image can migrate on start without
 * shipping a TypeScript toolchain.
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set; refusing to migrate.");
  process.exit(1);
}

const dir = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS keep_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = await sql`SELECT name, checksum FROM keep_migrations`;
  const appliedMap = new Map(applied.map((row) => [row.name, row.checksum]));

  for (const file of files) {
    const body = await readFile(path.join(dir, file), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");
    const previous = appliedMap.get(file);

    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${file} changed after being applied. Create a new migration instead.`,
        );
      }
      console.log(`= ${file} already applied`);
      continue;
    }

    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO keep_migrations (name, checksum) VALUES (${file}, ${checksum})`;
    });
    console.log(`+ ${file} applied`);
  }

  console.log("Migrations up to date.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
