-- Keep app database schema (database: keep).
-- Owned by Drizzle ORM in db/schema.ts; this SQL is the migration of record.

CREATE TABLE IF NOT EXISTS app_session (
  session_hash text PRIMARY KEY,
  user_id integer NOT NULL,
  username text NOT NULL,
  is_owner boolean NOT NULL DEFAULT false,
  token_cipher text NOT NULL,
  refresh_cipher text,
  access_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent_hash text,
  ip_hash text
);

CREATE INDEX IF NOT EXISTS app_session_user_idx ON app_session (user_id);

CREATE TABLE IF NOT EXISTS recent_repo (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  full_name text NOT NULL,
  last_accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recent_repo_user_name_idx ON recent_repo (user_id, full_name);

CREATE TABLE IF NOT EXISTS user_pref (
  user_id integer PRIMARY KEY,
  theme text NOT NULL DEFAULT 'system',
  density text NOT NULL DEFAULT 'compact',
  diff_mode text NOT NULL DEFAULT 'unified',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_search (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  name text NOT NULL,
  query text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id serial PRIMARY KEY,
  user_id integer,
  action text NOT NULL,
  resource text,
  request_id text,
  ip_hash text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at);

CREATE TABLE IF NOT EXISTS render_cache (
  key text PRIMARY KEY,
  html text NOT NULL,
  renderer_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
