-- Idempotency-Key enforcement for create endpoints.
-- The app database already owns sessions/audit/prefs; this table holds no forge
-- data, only the fingerprints and replayed responses of accepted writes.

CREATE TABLE IF NOT EXISTS idempotency_record (
  id text PRIMARY KEY,
  user_id integer NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  key text NOT NULL,
  fingerprint text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'completed')),
  status integer,
  response text,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idempotency_record_expires_idx ON idempotency_record (expires_at);
