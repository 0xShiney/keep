#!/bin/sh
# Encrypted, deduplicated backup of both databases and all repository data.
#
#   docker compose --profile backup run --rm backup
#
# Restic handles client-side encryption and retention; nothing is uploaded in
# plaintext. RPO is whatever schedule runs this (cron/systemd timer, every 6h).
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is empty}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is empty}"
: "${POSTGRES_USER:?}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="/work/${STAMP}"
mkdir -p "$WORK"

echo "dumping forgejo"
forgejo dump --config /data/gitea/conf/app.ini --type tar --file "$WORK/forgejo-dump.tar" --verbose

echo "dumping keep"
pg_dump --host postgres --username "$POSTGRES_USER" --dbname "${KEEP_DB_NAME:-keep}" \
	--format=custom --no-owner --file "$WORK/keep.dump"

echo "recording versions"
printf 'forgejo=%s\n' "$(cat /data/gitea/VERSION 2>/dev/null || echo unknown)" >"$WORK/VERSIONS"
printf 'backup=%s\n' "$STAMP" >>"$WORK/VERSIONS"

echo "uploading to restic"
restic backup --tag keep --host keep "$WORK" /forgejo-data/repositories

echo "applying retention"
restic forget --tag keep --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune

rm -rf "$WORK"
echo "backup complete: $STAMP"
