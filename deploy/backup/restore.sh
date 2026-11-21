#!/bin/sh
# Restore a backup into a clean stack.
#
#   RESTORE_SNAPSHOT=latest ./deploy/backup/restore.sh
#
# DESTRUCTIVE: stops web/forgejo, replaces the databases and repository files, and
# then restarts. Rehearse this on a throwaway host (docs/BACKUP-RESTORE.md).
set -eu

: "${RESTIC_REPOSITORY:?}"
: "${RESTIC_PASSWORD:?}"
: "${RESTORE_SNAPSHOT:=latest}"
: "${POSTGRES_USER:?}"

COMPOSE="docker compose -f $(dirname "$0")/../compose.yaml"

echo "stopping application services"
$COMPOSE stop web forgejo

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "restoring snapshot $RESTORE_SNAPSHOT"
restic restore "$RESTORE_SNAPSHOT" --target "$WORK" --include /work

DUMP_DIR="$(find "$WORK" -type d -name '20*' | sort | tail -1)"
[ -n "$DUMP_DIR" ] || { echo "no dump found in snapshot" >&2; exit 1; }

echo "restoring postgres databases"
$COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
	-c "DROP DATABASE IF EXISTS forgejo WITH (FORCE);" \
	-c "CREATE DATABASE forgejo;"
$COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d forgejo \
	-c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" || true
$COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
	-c "DROP DATABASE IF EXISTS \"${KEEP_DB_NAME:-keep}\" WITH (FORCE);" \
	-c "CREATE DATABASE \"${KEEP_DB_NAME:-keep}\";"

$COMPOSE exec -T postgres pg_restore -U "$POSTGRES_USER" -d "${KEEP_DB_NAME:-keep}" \
	--no-owner --clean --if-exists <"$DUMP_DIR/keep.dump"

echo "restoring forgejo data volume"
$COMPOSE run --rm --no-deps -T -v "$DUMP_DIR:/restore:ro" --entrypoint sh forgejo -c '
	set -eu
	tar -xf /restore/forgejo-dump.tar -C /tmp
	# forgejo dump writes a directory containing data/
	find /tmp -maxdepth 2 -type d -name data -exec cp -a {}/. /data/ \;
'

echo "starting services"
$COMPOSE up -d
echo "restore complete — verify repositories, issues, PRs and SSH keys"
