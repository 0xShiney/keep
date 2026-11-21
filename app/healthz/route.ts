import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness: the process can serve requests. Intentionally dependency-free. */
export function GET() {
  return NextResponse.json(
    { status: "ok", service: "keep-web", time: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
