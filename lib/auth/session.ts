import { cookies } from "next/headers";
import { cache } from "react";
import { decryptSecret, encryptSecret, hashSessionId, randomToken, sha256Hex } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { getSessionStore, type StoredSession } from "./session-store";
import { refreshTokenGrant } from "./oauth";
import { childLogger } from "@/lib/logger";
import type { UserIdentity } from "@/lib/forgejo/model";

const log = childLogger({ module: "session" });

const COOKIE_BASE = "keep_session";
const TOUCH_INTERVAL_MS = 60_000;
const REFRESH_SKEW_MS = 60_000;

export interface Identity {
  userId: number;
  username: string;
  isOwner: boolean;
  accessToken: string;
  sessionHash: string;
}

export function sessionCookieName(): string {
  // __Host- requires Secure, which browsers refuse over plain http. Production
  // is always https, so the hardened name is used there.
  return getEnv().APP_ORIGIN.startsWith("https://") ? `__Host-${COOKIE_BASE}` : COOKIE_BASE;
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  const secure = getEnv().APP_ORIGIN.startsWith("https://");
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

function isOwnerLogin(user: UserIdentity): boolean {
  const configured = getEnv().KEEP_OWNER_LOGIN;
  if (configured) return user.login === configured;
  return user.isAdmin;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
}

export async function createSession(
  user: UserIdentity,
  tokens: TokenSet,
  meta: { userAgentHash: string | null; ipHash: string | null },
): Promise<{ sessionId: string; maxAgeSeconds: number }> {
  const env = getEnv();
  const now = new Date();
  const sessionId = randomToken(32);
  const idleMs = env.SESSION_IDLE_MINUTES * 60_000;
  const absoluteMs = env.SESSION_ABSOLUTE_HOURS * 3_600_000;

  const record: StoredSession = {
    sessionHash: hashSessionId(sessionId),
    userId: user.id,
    username: user.login,
    isOwner: isOwnerLogin(user),
    tokenCipher: encryptSecret(tokens.accessToken),
    refreshCipher: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    accessExpiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
    absoluteExpiresAt: new Date(now.getTime() + absoluteMs),
    idleExpiresAt: new Date(now.getTime() + idleMs),
    createdAt: now,
    lastSeenAt: now,
    userAgentHash: meta.userAgentHash,
    ipHash: meta.ipHash,
  };

  await getSessionStore().create(record);
  return { sessionId, maxAgeSeconds: Math.floor(idleMs / 1000) };
}

async function refreshIfNeeded(
  session: StoredSession,
): Promise<{ token: string; session: StoredSession } | null> {
  const now = Date.now();
  if (session.accessExpiresAt.getTime() - REFRESH_SKEW_MS > now) {
    return { token: decryptSecret(session.tokenCipher), session };
  }

  if (!session.refreshCipher) return null;

  try {
    const refreshed = await refreshTokenGrant(decryptSecret(session.refreshCipher));
    const accessExpiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000);
    const tokenCipher = encryptSecret(refreshed.accessToken);
    const refreshCipher = refreshed.refreshToken
      ? encryptSecret(refreshed.refreshToken)
      : session.refreshCipher;

    await getSessionStore().updateTokens(
      session.sessionHash,
      tokenCipher,
      refreshCipher,
      accessExpiresAt,
    );

    return {
      token: refreshed.accessToken,
      session: { ...session, tokenCipher, refreshCipher, accessExpiresAt },
    };
  } catch (error) {
    log.warn({ err: (error as Error).message }, "token refresh failed; ending session");
    await getSessionStore().destroy(session.sessionHash);
    return null;
  }
}

/**
 * Resolves the current identity from the session cookie. Cached per render pass
 * so a page that renders several server components touches the store once.
 */
export const getIdentity = cache(async (): Promise<Identity | null> => {
  const jar = await cookies();
  const sessionId = jar.get(sessionCookieName())?.value;
  if (!sessionId) return null;

  const sessionHash = hashSessionId(sessionId);
  const store = getSessionStore();
  const session = await store.get(sessionHash);
  if (!session) return null;

  const now = Date.now();
  if (session.idleExpiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
    await store.destroy(sessionHash);
    return null;
  }

  const refreshed = await refreshIfNeeded(session);
  if (!refreshed) return null;

  if (now - refreshed.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const env = getEnv();
    const idle = new Date(now + env.SESSION_IDLE_MINUTES * 60_000);
    const absolute = refreshed.session.absoluteExpiresAt;
    await store.touch(sessionHash, idle > absolute ? absolute : idle, new Date(now));
  }

  return {
    userId: refreshed.session.userId,
    username: refreshed.session.username,
    isOwner: refreshed.session.isOwner,
    accessToken: refreshed.token,
    sessionHash,
  };
});

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(sessionCookieName())?.value;
  if (sessionId) {
    await getSessionStore().destroy(hashSessionId(sessionId));
  }
  jar.delete(sessionCookieName());
}

export async function setSessionCookie(sessionId: string, maxAgeSeconds: number): Promise<void> {
  const jar = await cookies();
  jar.set(sessionCookieName(), sessionId, sessionCookieOptions(maxAgeSeconds));
}

export function hashUserAgent(userAgent: string | null): string | null {
  return userAgent ? sha256Hex(`ua:${userAgent}`).slice(0, 32) : null;
}
