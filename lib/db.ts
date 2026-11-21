import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "@/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;

interface GlobalWithDb {
  __keepDb?: Database;
  __keepSql?: ReturnType<typeof postgres>;
}

const globalForDb = globalThis as unknown as GlobalWithDb;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

/**
 * Lazily creates one pooled connection per process. Next.js dev reloads reuse
 * the global so hot reload cannot leak pools.
 */
export function getDb(): Database {
  if (globalForDb.__keepDb) return globalForDb.__keepDb;

  const url = getEnv().DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();

  const client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });

  globalForDb.__keepSql = client;
  globalForDb.__keepDb = db;
  return db;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getEnv().DATABASE_URL);
}

export async function pingDatabase(): Promise<{ ok: boolean; error?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, error: "DATABASE_URL not configured" };
  try {
    const sql = globalForDb.__keepSql ?? postgres(getEnv().DATABASE_URL, { max: 1 });
    globalForDb.__keepSql = sql;
    await sql`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}
