import { auditLog } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "audit" });

export interface AuditEvent {
  userId?: number | null;
  action: string;
  resource?: string;
  requestId: string;
  ipHash?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Security-relevant app events (sign-in, repo deletion, token creation) are
 * written to app.audit_log. Best-effort: auditing must never break the action it
 * describes, and the failure is logged.
 */
export async function audit(event: AuditEvent): Promise<void> {
  if (!isDatabaseConfigured()) {
    log.info({ action: event.action, resource: event.resource }, "audit (no database)");
    return;
  }
  try {
    await getDb()
      .insert(auditLog)
      .values({
        userId: event.userId ?? null,
        action: event.action,
        resource: event.resource ?? null,
        requestId: event.requestId,
        ipHash: event.ipHash ?? null,
        metadata: event.metadata ?? null,
      });
  } catch (error) {
    log.warn({ err: (error as Error).message, action: event.action }, "audit write failed");
  }
}
