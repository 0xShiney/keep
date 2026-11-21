import { and, desc, eq, lt } from "drizzle-orm";
import { appSession } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/lib/db";

export interface StoredSession {
  sessionHash: string;
  userId: number;
  username: string;
  isOwner: boolean;
  tokenCipher: string;
  refreshCipher: string | null;
  accessExpiresAt: Date;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  userAgentHash: string | null;
  ipHash: string | null;
}

export interface SessionStore {
  create(session: StoredSession): Promise<void>;
  get(sessionHash: string): Promise<StoredSession | null>;
  touch(sessionHash: string, idleExpiresAt: Date, lastSeenAt: Date): Promise<void>;
  updateTokens(
    sessionHash: string,
    tokenCipher: string,
    refreshCipher: string | null,
    accessExpiresAt: Date,
  ): Promise<void>;
  destroy(sessionHash: string): Promise<void>;
  listForUser(userId: number): Promise<StoredSession[]>;
  deleteExpired(now: Date): Promise<void>;
}

class PostgresSessionStore implements SessionStore {
  async create(session: StoredSession): Promise<void> {
    await getDb().insert(appSession).values(session);
  }

  async get(sessionHash: string): Promise<StoredSession | null> {
    const rows = await getDb()
      .select()
      .from(appSession)
      .where(eq(appSession.sessionHash, sessionHash))
      .limit(1);
    return rows[0] ?? null;
  }

  async touch(sessionHash: string, idleExpiresAt: Date, lastSeenAt: Date): Promise<void> {
    await getDb()
      .update(appSession)
      .set({ idleExpiresAt, lastSeenAt })
      .where(eq(appSession.sessionHash, sessionHash));
  }

  async updateTokens(
    sessionHash: string,
    tokenCipher: string,
    refreshCipher: string | null,
    accessExpiresAt: Date,
  ): Promise<void> {
    await getDb()
      .update(appSession)
      .set({ tokenCipher, refreshCipher, accessExpiresAt })
      .where(eq(appSession.sessionHash, sessionHash));
  }

  async destroy(sessionHash: string): Promise<void> {
    await getDb().delete(appSession).where(eq(appSession.sessionHash, sessionHash));
  }

  async listForUser(userId: number): Promise<StoredSession[]> {
    return getDb()
      .select()
      .from(appSession)
      .where(eq(appSession.userId, userId))
      .orderBy(desc(appSession.lastSeenAt));
  }

  async deleteExpired(now: Date): Promise<void> {
    await getDb()
      .delete(appSession)
      .where(and(lt(appSession.idleExpiresAt, now), lt(appSession.absoluteExpiresAt, now)));
  }
}

/**
 * Development fallback when DATABASE_URL is absent. Sessions are lost on
 * restart, which is acceptable only for local previews; production requires
 * DATABASE_URL (enforced in lib/env.ts).
 */
class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, StoredSession>();

  async create(session: StoredSession): Promise<void> {
    this.sessions.set(session.sessionHash, session);
  }

  async get(sessionHash: string): Promise<StoredSession | null> {
    const session = this.sessions.get(sessionHash);
    if (!session) return null;
    if (
      session.idleExpiresAt.getTime() <= Date.now() ||
      session.absoluteExpiresAt.getTime() <= Date.now()
    ) {
      this.sessions.delete(sessionHash);
      return null;
    }
    return session;
  }

  async touch(sessionHash: string, idleExpiresAt: Date, lastSeenAt: Date): Promise<void> {
    const session = this.sessions.get(sessionHash);
    if (!session) return;
    this.sessions.set(sessionHash, { ...session, idleExpiresAt, lastSeenAt });
  }

  async updateTokens(
    sessionHash: string,
    tokenCipher: string,
    refreshCipher: string | null,
    accessExpiresAt: Date,
  ): Promise<void> {
    const session = this.sessions.get(sessionHash);
    if (!session) return;
    this.sessions.set(sessionHash, { ...session, tokenCipher, refreshCipher, accessExpiresAt });
  }

  async destroy(sessionHash: string): Promise<void> {
    this.sessions.delete(sessionHash);
  }

  async listForUser(userId: number): Promise<StoredSession[]> {
    return [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  }

  async deleteExpired(now: Date): Promise<void> {
    for (const [key, session] of this.sessions) {
      if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now)
        this.sessions.delete(key);
    }
  }
}

interface GlobalWithStore {
  __keepSessionStore?: SessionStore;
}

const globalForStore = globalThis as unknown as GlobalWithStore;

export function getSessionStore(): SessionStore {
  if (globalForStore.__keepSessionStore) return globalForStore.__keepSessionStore;
  const store = isDatabaseConfigured() ? new PostgresSessionStore() : new MemorySessionStore();
  globalForStore.__keepSessionStore = store;
  return store;
}

/** Test helper. */
export function resetSessionStore(): void {
  globalForStore.__keepSessionStore = undefined;
}
