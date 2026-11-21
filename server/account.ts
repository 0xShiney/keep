import type { ForgejoGateway } from "@/lib/forgejo/gateway";
import type { AccessTokenInfo, SshKey } from "@/lib/forgejo/model";
import { getSessionStore } from "@/lib/auth/session-store";
import type { StoredSession } from "@/lib/auth/session-store";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "account" });

export async function listKeys(gateway: ForgejoGateway): Promise<SshKey[]> {
  return gateway.listKeys();
}

export async function listTokens(gateway: ForgejoGateway): Promise<AccessTokenInfo[]> {
  try {
    return await gateway.listTokens();
  } catch (error) {
    // Token listing needs a Forgejo admin token; surface an empty list plus a
    // documented explanation rather than failing the whole settings page.
    log.warn({ err: (error as Error).message }, "token listing unavailable");
    return [];
  }
}

export interface SessionSummary {
  id: string;
  username: string;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  current: boolean;
  userAgentHash: string | null;
}

export async function listSessions(
  userId: number,
  currentSessionHash: string,
): Promise<SessionSummary[]> {
  const sessions = await getSessionStore().listForUser(userId);
  return sessions.map((session: StoredSession) => ({
    id: session.sessionHash.slice(0, 12),
    username: session.username,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
    current: session.sessionHash === currentSessionHash,
    userAgentHash: session.userAgentHash,
  }));
}

export async function revokeSession(sessionHandle: string, userId: number): Promise<boolean> {
  const sessions = await getSessionStore().listForUser(userId);
  const target = sessions.find((session) => session.sessionHash.startsWith(sessionHandle));
  if (!target) return false;
  await getSessionStore().destroy(target.sessionHash);
  return true;
}

/** Very small allowlist of key formats we accept before asking Forgejo. */
export function looksLikeSshKey(value: string): boolean {
  return /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/=]+( [^\n]*)?$/.test(
    value.trim(),
  );
}
