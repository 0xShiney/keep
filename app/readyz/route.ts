import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { pingDatabase } from "@/lib/db";
import { childLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = childLogger({ module: "readyz" });

async function checkForgejo(): Promise<{ ok: boolean; error?: string }> {
  const env = getEnv();
  try {
    const response = await fetch(`${env.FORGEJO_INTERNAL_URL.replace(/\/+$/, "")}/api/v1/version`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unreachable" };
  }
}

/**
 * Readiness: the app can reach its dependencies. Returns 503 when any required
 * dependency is unavailable so the proxy/healthcheck does not route traffic.
 */
export async function GET() {
  const env = getEnv();
  const demo = env.KEEP_BACKEND === "fixture";
  const [database, forgejo] = await Promise.all([
    pingDatabase(),
    demo ? Promise.resolve({ ok: true }) : checkForgejo(),
  ]);

  // Fixture (demo) mode has no database or Forgejo to reach; it is ready when
  // the process answers, and says so explicitly rather than claiming to be real.
  const checks = {
    database: demo
      ? { ok: true, mode: "fixture" as const }
      : env.DATABASE_URL
        ? database
        : { ok: false, error: "not configured" },
    forgejo: demo ? { ok: true, mode: "fixture" as const } : forgejo,
  };

  const required = { database: checks.database.ok, forgejo: checks.forgejo.ok };
  const ok = required.database && required.forgejo;

  if (!ok) log.warn({ checks }, "readiness check failed");

  return NextResponse.json(
    { status: ok ? "ready" : "not-ready", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
