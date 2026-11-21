# Database

One PostgreSQL 16 instance, two databases. The app never writes to `forgejo`.

| Database  | Owner    | Contents                                                                                                    |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `forgejo` | Forgejo  | Users, repositories, git metadata, issues, PRs, reviews, labels, releases, keys, tokens, sessions, activity |
| `keep`    | This app | Sessions, preferences, recent repositories, optional saved searches, audit log, idempotency records, render cache |

Migrations: plain SQL in `db/migrations/`, applied by `scripts/migrate.mjs`
(filename order; each file runs in a transaction and its SHA-256 is recorded in
`keep_migrations` — editing an already-applied file is an error). `db/schema.ts`
mirrors the SQL for typed queries via Drizzle.

## `keep` schema (as of `0002_idempotency.sql`)

### `app_session`

| Column                               | Type        | Notes                                                                 |
| ------------------------------------ | ----------- | --------------------------------------------------------------------- |
| `session_hash`                       | text PK     | SHA-256 of the opaque cookie value; the raw id is never stored        |
| `user_id`                            | integer     | Forgejo user id                                                       |
| `username`                           | text        | Cached for display; source of truth is Forgejo                        |
| `is_owner`                           | boolean     | Owner flag resolved at sign-in                                        |
| `token_cipher`                       | text        | AES-256-GCM ciphertext (key derived from `SESSION_SECRET`)            |
| `refresh_cipher`                     | text        | Encrypted refresh token, when Forgejo issues one                      |
| `access_expires_at`                  | timestamptz | Access-token expiry; refreshed before use                             |
| `absolute_expires_at`                | timestamptz | Hard session limit (`SESSION_ABSOLUTE_HOURS`)                         |
| `idle_expires_at`                    | timestamptz | Sliding idle limit (`SESSION_IDLE_MINUTES`)                           |
| `created_at`, `last_seen_at`         | timestamptz |                                                                       |
| `user_agent_hash`, `ip_hash`         | text        | Salted SHA-256; raw values are never stored                           |

Index: `app_session_user_idx (user_id)`.

### `recent_repo`

`id` serial PK, `user_id`, `full_name`, `last_accessed_at`; unique on
`(user_id, full_name)`. Powers “Recently visited” on the dashboard.

### `user_pref`

`user_id` PK, `theme` (`dark`/`light`/`system`), `density`, `diff_mode`,
`updated_at`. Theme is also mirrored in the `keep_theme` cookie so the server can
render the correct Shiki theme without a flash.

### `saved_search` (optional)

`id`, `user_id`, `name`, `query`, `created_at`. Table exists; no UI yet.

### `audit_log`

`id`, `user_id`, `action`, `resource`, `metadata` (jsonb), `request_id`,
`ip_hash`, `created_at` (indexed). Written for sign-in/out, session revocation,
repository create/rename/delete, merges and token/key changes. Never contains
tokens, cookies or file contents.

### `idempotency_record`

`id` text PK (`sha256(userId, method, path, key)`), `user_id`, `method`, `path`,
`key`, `fingerprint` (`sha256(method, path, raw body)`), `state`
(`pending`/`completed`), `status`, `response`, `content_type`, `created_at`,
`expires_at` (indexed).

Stores no forge data: only the fingerprint and the response already returned to
the client, for 24 h. This is the one table added beyond the blueprint's list,
because `Idempotency-Key` enforcement needs a durable dedupe store; it is an
app-owned coordination table, not a second copy of Forgejo data (D-020).

### `render_cache` (optional)

`key` (blob SHA + renderer version + theme), `html`, `renderer_version`,
`created_at`. Table exists for a future persistent highlight cache; the current
highlighter uses a bounded in-process LRU, so the table is unused.

### `keep_migrations`

`name` PK, `checksum`, `applied_at`. Owned by the migrator, never by the app.

## Ownership and isolation

- Forgejo's schema is migrated only by Forgejo. No ORM or migration in this repo
  touches it.
- `keep` holds no forge data: repositories, issues, PRs, keys and tokens live in
  Forgejo and are read through its API. See [ARCHITECTURE](ARCHITECTURE.md).
- Backups: `pg_dump -Fc` of `keep` plus `forgejo dump` (see
  [BACKUP-RESTORE](BACKUP-RESTORE.md)).

## Data minimisation

- No email addresses, passwords or tokens are stored in `keep`.
- IP and user-agent are hashed with the session secret before storage.
- Deleting a session removes the ability to use the token; the token itself expires
  at Forgejo.
- Idempotency responses are capped by the response size the API already returns and
  expire after 24 h; `DELETE FROM idempotency_record WHERE expires_at < now()` is
  safe at any time (the app also retakes expired reservations on demand).

## Growth expectations

For one operator: sessions in the tens, recent repos in the hundreds, audit log in
the tens of thousands per year, idempotency records in the thousands (24 h TTL).
Nothing here needs partitioning; a yearly
`DELETE FROM audit_log WHERE created_at < now() - interval '2 years'` is enough.
