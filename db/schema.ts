import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The `keep` database holds ONLY data Forgejo does not own.
 * Repositories, issues, pull requests, releases, users, keys and tokens all live
 * in Forgejo. See docs/DATABASE.md for the ownership table.
 */

export const appSession = pgTable(
  "app_session",
  {
    /** SHA-256 of the cookie value; a database leak cannot resurrect a session. */
    sessionHash: text("session_hash").primaryKey(),
    userId: integer("user_id").notNull(),
    username: text("username").notNull(),
    isOwner: boolean("is_owner").notNull().default(false),
    tokenCipher: text("token_cipher").notNull(),
    refreshCipher: text("refresh_cipher"),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgentHash: text("user_agent_hash"),
    ipHash: text("ip_hash"),
  },
  (table) => [index("app_session_user_idx").on(table.userId)],
);

export const recentRepo = pgTable(
  "recent_repo",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    fullName: text("full_name").notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("recent_repo_user_name_idx").on(table.userId, table.fullName)],
);

export const userPref = pgTable("user_pref", {
  userId: integer("user_id").primaryKey(),
  theme: text("theme").notNull().default("system"),
  density: text("density").notNull().default("compact"),
  diffMode: text("diff_mode").notNull().default("unified"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedSearch = pgTable("saved_search", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    action: text("action").notNull(),
    resource: text("resource"),
    requestId: text("request_id"),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_created_idx").on(table.createdAt)],
);

export const idempotencyRecord = pgTable(
  "idempotency_record",
  {
    /** sha256(user + method + path + Idempotency-Key) */
    id: text("id").primaryKey(),
    userId: integer("user_id").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    key: text("key").notNull(),
    /** sha256 of the method, path and raw request body. */
    fingerprint: text("fingerprint").notNull(),
    state: text("state").notNull(),
    status: integer("status"),
    response: text("response"),
    contentType: text("content_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idempotency_record_expires_idx").on(table.expiresAt)],
);

export const renderCache = pgTable("render_cache", {
  key: text("key").primaryKey(),
  html: text("html").notNull(),
  rendererVersion: text("renderer_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
