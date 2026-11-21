#!/usr/bin/env bash
# Encrypted, deduplicated backup of both databases and all repository data.
#
# Runs on the host (needs docker compose and restic):
#
#   ./deploy/backup/backup.sh
#
# Restic handles client-side encryption and retention; nothing is uploaded in
# plaintext. RPO is whatever schedule runs this (cron/systemd timer, every 6h).
#
# The stack's restic image is not used for this: it carries neither the forgejo
# binary nor pg_dump, so the dumps are taken through `docker compose exec` and
# only the finished directory is handed to restic.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE=(docker compose --env-file "$ROOT/.env" -f "$ROOT/deploy/compose.yaml")

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is empty}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is empty}"
: "${POSTGRES_USER:?POSTGRES_USER is empty}"
command -v restic >/dev/null || {
	echo "restic is required on the host (https://restic.net)" >&2
	exit 1
}

KEEP_DB="${KEEP_DB_NAME:-keep}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$ROOT/deploy/backup/work/$STAMP"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "dumping forgejo"
"${COMPOSE[@]}" exec -T --user git forgejo sh -c \
	'rm -f /tmp/forgejo-dump.tar && forgejo dump --config /data/gitea/conf/app.ini --type tar --file /tmp/forgejo-dump.tar'
"${COMPOSE[@]}" cp forgejo:/tmp/forgejo-dump.tar "$WORK/forgejo-dump.tar"
"${COMPOSE[@]}" exec -T --user git forgejo rm -f /tmp/forgejo-dump.tar

echo "dumping forgejo and $KEEP_DB"
# forgejo dump's SQL is not dependency-ordered, so the database is taken with
# pg_dump; the tar above is kept for repository files and configuration.
"${COMPOSE[@]}" exec -T postgres pg_dump --username "$POSTGRES_USER" --dbname forgejo \
	--format=custom --no-owner >"$WORK/forgejo.dump"
"${COMPOSE[@]}" exec -T postgres pg_dump --username "$POSTGRES_USER" --dbname "$KEEP_DB" \
	--format=custom --no-owner >"$WORK/keep.dump"

# Guard against a silently empty dump: an unreadable backup is worse than none.
for f in forgejo-dump.tar forgejo.dump keep.dump; do
	[ -s "$WORK/$f" ] || {
		echo "$f is empty - aborting" >&2
		exit 1
	}
done

echo "recording versions"
{
	printf 'forgejo=%s\n' "$("${COMPOSE[@]}" exec -T --user git forgejo forgejo --version | awk '{print $3}')"
	printf 'postgres=%s\n' "$("${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d postgres -tAc 'show server_version')"
	printf 'backup=%s\n' "$STAMP"
} >"$WORK/VERSIONS"

echo "uploading to restic"
restic backup --tag keep --host keep "$WORK"

echo "applying retention"
restic forget --tag keep --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune

echo "backup complete: $STAMP"
