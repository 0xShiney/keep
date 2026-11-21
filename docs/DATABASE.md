# Database

One PostgreSQL 16 instance, two databases. The app never writes to `forgejo`.

| Database  | Owner    | Contents                                                                                                    |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `forgejo` | Forgejo  | Users, repositories, git metadata, issues, PRs, reviews, labels, releases, keys, tokens, sessions, activity |
| `keep`    | This app | Sessions, preferences, recent repositories, optional saved searches, audit log, render cache                |

Migrations: plain SQL in `db/migrations/`, applied by `scripts/migrate.mjs`
(filename order, checksum recorded in `schema_migrations`; an edited applied file is
an error). `db/schema.ts` mirrors the SQL for typed queries via Drizzle.

## `keep` schema

### `app_session`

| Column                       | Type        | Notes                                                          |
| ---------------------------- | ----------- | -------------------------------------------------------------- |
| `id_hash`                    | text PK     | SHA-256 of the opaque cookie value; the raw id is never stored |
| `user_id`                    | bigint      | Forgejo user id                                                |
| `username`                   | text        | Cached for display; source of truth is Forgejo                 |
| `access_token_enc`           | text        | AES-256-GCM ciphertext (HKDF key from `SESSION_SECRET`)        |
| `created_at`                 | timestamptz |                                                                |
| `last_seen_at`               | timestamptz | Idle timeout input                                             |
| `expires_at`                 | timestamptz | Absolute timeout                                               |
| `ip_hash`, `user_agent_hash` | text        | Hashed, for the session list; never raw values                 |
| `revoked_at`                 | timestamptz | Set on logout/revocation                                       |

Indexes: `user_id`, `expires_at`.

### `recent_repo`

`user_id`, `owner`, `name`, `viewed_at`; primary key `(user_id, owner, name)`.
Powers “Recently visited” on the dashboard. Pruned to the newest 20 per user on write.

### `user_pref`

`user_id` PK, `theme` (`dark`/`light`), `density`, `diff_mode`, `updated_at`.
Theme is also mirrored in the `keep_theme` cookie so the server can render the
correct Shiki theme without a flash.

### `saved_search` (optional)

`id`, `user_id`, `name`, `query`, `created_at`. Table exists; no UI yet.

### `audit_log`

`id`, `user_id`, `action`, `resource`, `metadata` (jsonb), `request_id`, `created_at`.
Written for sign-in/out, session revocation, repository create/rename/delete and
merges. Never contains tokens, cookies or file contents.

### `render_cache` (optional)

`key` (blob SHA + renderer version + theme), `html`, `created_at`. Table exists for a
future persistent highlight cache; the current highlighter uses a bounded in-process
LRU, so the table is unused.

## Ownership and isolation

- The web container connects with a role that owns `keep` and has **no** privileges
  on `forgejo` beyond what Forgejo itself needs. In the simple single-role setup the
  same role owns both; document any change here.
- Forgejo's schema is migrated only by Forgejo. No ORM or migration in this repo
  touches it.
- Backups: `pg_dump -Fc` of `keep` plus `forgejo dump` (see
  [BACKUP-RESTORE](BACKUP-RESTORE.md)).

## Data minimisation

- No email addresses, passwords or tokens are stored in `keep`.
- IP and user-agent are hashed with the session secret before storage.
- Deleting a session removes the ability to use the token; the token itself expires
  at Forgejo.

## Growth expectations

For one operator: sessions in the tens, recent repos in the hundreds, audit log in
the tens of thousands per year. Nothing here needs partitioning; a yearly
`DELETE FROM audit_log WHERE created_at < now() - interval '2 years'` is enough.
