# Backup and restore

Targets: **RPO ≤ 24 h**, **RTO ≤ 1 h**. Both are met by a 6-hourly restic run and a
scripted restore; neither number has been measured in a drill yet (no Docker in the
delivery workspace).

## What is backed up

| Data                                            | Method                                          |
| ----------------------------------------------- | ----------------------------------------------- |
| Forgejo database + configuration + repositories | `forgejo dump` (tar)                            |
| App database (`keep`)                           | `pg_dump --format=custom`                       |
| Repository files (belt and braces)              | restic snapshot of `/forgejo-data/repositories` |
| Versions                                        | `VERSIONS` file written next to the dumps       |

`deploy/backup/backup.sh` writes a timestamped directory under `/work`, snapshots it,
applies retention (`--keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune`), and
deletes the local copy. Restic encrypts client-side; the remote target only sees
ciphertext.

## Schedule

Run every 6 hours from the host (systemd timer or cron):

```cron
0 */6 * * * cd /srv/keep && docker compose --profile backup run --rm backup >> /var/log/keep-backup.log 2>&1
```

Store `RESTIC_PASSWORD` outside the host as well (password manager / sealed
envelope). Losing it makes every snapshot unrecoverable.

## Verify

```bash
docker compose --profile backup run --rm backup
docker run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD restic/restic snapshots
docker run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD restic/restic check --read-data-subset=5%
```

## Restore (clean host or in place)

`deploy/backup/restore.sh` is **destructive**: it stops web/forgejo, recreates both
databases, restores the app dump, unpacks the Forgejo dump into `/data`, and starts
the stack.

```bash
export RESTORE_SNAPSHOT=latest
./deploy/backup/restore.sh
curl -fsS https://app.<domain>/readyz
```

Then verify manually:

1. Sign in; the dashboard lists repositories.
2. Open a repository, a commit, an issue and a pull request.
3. `git clone` over HTTPS and SSH; push a test commit.
4. Check SSH keys and tokens on the settings pages.
5. `docker compose logs web forgejo | grep -i error` is clean.

## Drill (required before calling backup “working”)

On a **separate** host or compose project:

1. Deploy the stack, create two repositories, an issue, a PR, an SSH key and a token.
2. Run a backup; note the snapshot id.
3. `docker compose down -v` (destroys volumes) and remove `deploy/secrets`.
4. Recreate `.env` from the stored copy, run `restore.sh` against the snapshot.
5. Verify every item from the list above, including the git objects and the SSH key
   fingerprint. Record the elapsed time as the observed RTO.

**Status: not run.** The scripts exist and are reviewed, but the drill requires
Docker, which is unavailable here. Until it passes, treat backups as unproven.

## Failure modes

| Failure                          | Response                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Backup job fails                 | Alert on non-zero exit; the next run is independent (restic handles partial uploads)               |
| Corrupt snapshot                 | `restic check`; fall back to the previous snapshot                                                 |
| Lost `RESTIC_PASSWORD`           | Unrecoverable by design; escrow the password                                                       |
| Restore leaves Forgejo unhealthy | Check `/data/gitea/conf/app.ini` permissions and DB credentials, then rerun `forgejo dump` restore |
