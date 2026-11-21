# Backup and restore

Targets: **RPO ≤ 24 h**, **RTO ≤ 1 h**. A real wipe/restore drill on 2026-11-21
measured **55 s** from starting the wipe to a signed-in, working app on a warm
host. Treat that as a floor, not a guarantee for a cold DR host.

## What is backed up

| Data                                            | Method                                          |
| ----------------------------------------------- | ----------------------------------------------- |
| Forgejo database                                | `pg_dump --format=custom` (`forgejo.dump`)      |
| App database (`keep`)                           | `pg_dump --format=custom` (`keep.dump`)         |
| Forgejo repository files, avatars, keys, config | `forgejo dump` (tar, `forgejo-dump.tar`)        |
| Versions                                        | `VERSIONS` file written next to the dumps       |

`forgejo dump`'s SQL is **not** used for restore: its tables are emitted in an order
that fails against an empty database (`public.repository` is referenced before it is
created). The tar is kept for files and `app.ini`; both databases come from
`pg_dump`, which restores in dependency order.

`deploy/backup/backup.sh` is a **host** script (needs `docker`, `docker compose` and
`restic`). It writes a timestamped directory under `deploy/backup/work`, refuses to
upload if any of the three artefacts is empty, snapshots the directory with restic,
applies retention (`--keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune`) and
deletes the local copy. Restic encrypts client-side; the remote target only sees
ciphertext.

The restic image is not used for the dumps: it contains neither `forgejo` nor
`pg_dump`. The dumps are taken through `docker compose exec`.

## Schedule

Run every 6 hours from the host (systemd timer or cron):

```cron
0 */6 * * * cd /srv/keep && ./deploy/backup/backup.sh >> /var/log/keep-backup.log 2>&1
```

Store `RESTIC_PASSWORD` outside the host as well (password manager / sealed
envelope). Losing it makes every snapshot unrecoverable.

## Verify

```bash
./deploy/backup/backup.sh
restic -r "$RESTIC_REPOSITORY" snapshots
restic -r "$RESTIC_REPOSITORY" ls -l latest   # three non-zero dumps + VERSIONS
restic -r "$RESTIC_REPOSITORY" check --read-data-subset=5%
```

## Restore (clean host or in place)

`deploy/backup/restore.sh` is **destructive**: it stops web/forgejo, recreates both
databases, restores both `pg_dump` files, unpacks the Forgejo tar into the data
volume (`data/` → `/data/gitea`, `repos/` → `/data/git/repositories`), fixes volume
ownership to UID/GID 1000, then starts the services and waits for `/api/healthz`.

```bash
export RESTORE_SNAPSHOT=latest
./deploy/backup/restore.sh
curl -fsS https://app.<domain>/readyz
```

Set `RESTORE_START_SERVICES` to override what starts at the end (default
`web forgejo caddy`; use `forgejo` when the app runs natively). This is also how the
drill below was run, with the local compose port override.

Then verify manually:

1. Sign in; the dashboard lists repositories.
2. Open a repository, a commit, an issue and a pull request.
3. `git clone` over HTTPS and SSH; push a test commit.
4. Check SSH keys and tokens on the settings pages.
5. `docker compose logs web forgejo | grep -i error` is clean.

## Drill result (2026-11-21)

Compose stack: Postgres 16.10 + Forgejo 15.0.12; app native. Data seeded with two
repositories (`keep/keep`, `keep/bench`), an issue, a PR, an SSH key (`drill`) and a
scoped token (`drill-token`).

1. Backup: 5.2 s, snapshot `da97d3d8` (forgejo.dump 398 KB, keep.dump 15 KB,
   forgejo-dump.tar 3.0 MB).
2. `docker compose down -v`: 2 s; both named volumes gone.
3. `restore.sh`: **16 s** to a healthy Forgejo (18 s including the wipe).
4. App started: `/readyz` 200 after **30 s** (includes recreating the containers with
   the local port override and Next startup).
5. Playwright sign-in through Forgejo: **7 s**; dashboard loads.
6. Verified after restore: 2 users, 2 repositories, 2 issues, 1 PR, 1 SSH key,
   4 tokens, both commits (`41b829e`, `02398a5`), HTTPS and SSH `git ls-remote`,
   issue/PR/keys API 200, `app_session` and `audit_log` rows restored, and the full
   E2E suite (10/10) plus a11y (25/25) passed.

**Measured RTO: 55 s** to a signed-in service (18 s backend only). Well inside the
1 h target on this host. A cold host still needs image pulls and `.env`/secrets
restoration, which this drill did not simulate.

## Failure modes

| Failure                          | Response                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Backup job fails                 | Alert on non-zero exit; the next run is independent (restic handles partial uploads)               |
| Empty dump                       | `backup.sh` aborts before upload if any artefact is zero-length                                    |
| Corrupt snapshot                 | `restic check`; fall back to the previous snapshot                                                 |
| Lost `RESTIC_PASSWORD`           | Unrecoverable by design; escrow the password                                                       |
| Restore leaves Forgejo unhealthy | Check `/data/gitea/conf/app.ini` permissions and DB credentials, then inspect `compose logs forgejo` |
