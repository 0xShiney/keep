# Deployment

Single host, five containers. Target baseline: 2 vCPU / 4 GB / 20 GB SSD, Docker
Engine 24+, Compose v2, a domain you control.

> These steps have **not** been executed end-to-end in the delivery environment
> (no Docker daemon). Commands are validated against the files in `deploy/` and
> Forgejo's documented CLI/API, but treat the first install as a supervised run and
> keep [BACKUP-RESTORE](BACKUP-RESTORE.md) open.

## 1. DNS and firewall

| Record         | Points to |
| -------------- | --------- |
| `app.<domain>` | host IP   |
| `git.<domain>` | host IP   |

Open inbound **80/tcp** (ACME + redirect), **443/tcp**, **443/udp** (HTTP/3) and
**2222/tcp** (git SSH). Do not expose 3000, 3001 or 5432. Caddy obtains and renews
certificates automatically.

## 2. Configuration

```bash
cp .env.example .env && chmod 600 .env
```

Required: `APP_HOST`, `GIT_HOST`, `APP_ORIGIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD`,
`DATABASE_URL` (pointing at the `keep` database), `SESSION_SECRET` (≥32 chars),
`KEEP_OWNER_LOGIN`, `KEEP_OWNER_EMAIL`, `KEEP_OWNER_PASSWORD`, and a restic target.
Generate secrets with `openssl rand -base64 32`; never commit `.env`.

The Postgres container creates both databases on first boot:
`init-keep-db.sql` adds `keep` next to Forgejo's. The app role needs access to
`keep`; the simplest supported setup is one role that owns both, documented in
[DATABASE](DATABASE.md).

## 3. Start the data services

```bash
docker compose -f deploy/compose.yaml up -d postgres forgejo
docker compose -f deploy/compose.yaml ps          # both healthy
```

Forgejo's `app.ini` is generated from the `FORGEJO__*` environment variables in
`compose.yaml`: install lock on, registration off, private-by-default repos,
actions/packages/federation off, Argon2 password hashing.

## 4. Bootstrap the owner and OAuth app

```bash
./deploy/forgejo/bootstrap.sh
```

Creates the owner (if absent), registers an OAuth application with the exact
callback `https://$APP_HOST/api/auth/callback`, writes
`deploy/secrets/oauth.env` (0600), and deletes its bootstrap token. Copy the two
values into `.env` as `FORGEJO_CLIENT_ID` / `FORGEJO_CLIENT_SECRET`.

If your Forgejo version's admin CLI differs, do it by hand: create the user in
Forgejo (via tunnel), then Settings → Applications → **OAuth2 Applications** → new
app with the callback above and “confidential client” enabled.

## 5. Build and start the app

```bash
docker compose -f deploy/compose.yaml up -d --build
docker compose -f deploy/compose.yaml ps
curl -fsS https://app.<domain>/healthz
curl -fsS https://app.<domain>/readyz
```

`readyz` must report both `database` and `forgejo` as `ok`; otherwise the app
returns 503 and Caddy's health check keeps it out of rotation.

## 6. First login

Open `https://app.<domain>` → **Continue with Forgejo** → sign in as the owner →
enable 2FA in Forgejo's settings (recommended) → create a repository.

## Images and digests

`deploy/images.lock.json` records the exact digests currently referenced in
`compose.yaml` and `caddy/Dockerfile`. `node scripts/pin-images.mjs` re-resolves
tags through the registry APIs (no Docker needed) and rewrites the lock; then update
the digest literals. Upgrade deliberately:

1. Read the release notes (Forgejo LTS patch, Next.js security advisory).
2. Bump the tag in `compose.yaml`/Dockerfile, run `pin-images`, update digests.
3. `docker compose up -d --build`, watch `/readyz` and logs.
4. Keep the previous `.env` and image digests to roll back.

## Operations

| Task              | Command                                                        |
| ----------------- | -------------------------------------------------------------- |
| Logs (JSON, pino) | `docker compose logs -f web`                                   |
| Restart app only  | `docker compose up -d --force-recreate web`                    |
| Forgejo admin UI  | `ssh -L 3001:forgejo:3000 user@host` → `http://localhost:3001` |
| Migrations        | automatic in the web entrypoint (`scripts/migrate.mjs`)        |
| Backup            | `docker compose --profile backup run --rm backup`              |
| Health            | `/healthz` (liveness), `/readyz` (DB + Forgejo)                |

## Upgrades and rollback

- **App**: pull, rebuild, `up -d web`. Roll back by checking out the previous commit
  and rebuilding; the schema is forward-only, so avoid destructive migrations in the
  same release as a rollback plan.
- **Forgejo**: LTS patch within 48 h of a security release (see
  [SECURITY](SECURITY.md)). Stop `web`, upgrade `forgejo`, wait for healthy, then
  start `web`. Forgejo migrates its own schema; roll back only by restoring the
  pre-upgrade dump.
- Pin, test, then tag releases (`phase-N-complete` per the blueprint).

## Troubleshooting

| Symptom                                    | Likely cause                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Login redirects back with `invalid_state`  | Clock skew or `APP_ORIGIN` ≠ real origin (cookies)                       |
| `redirect_uri` mismatch at Forgejo         | OAuth app callback must be exactly `https://$APP_HOST/api/auth/callback` |
| Clone over HTTPS 401                       | Use username + personal access token, not the account password           |
| `readyz` 503, database not configured      | `DATABASE_URL` empty or wrong role/DB                                    |
| Caddy “unrecognized directive: rate_limit” | Using stock Caddy instead of `deploy/caddy/Dockerfile`                   |
| Session lost on restart                    | `SESSION_SECRET` changed, or no `DATABASE_URL` (memory store)            |
