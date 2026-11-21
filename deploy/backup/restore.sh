#!/usr/bin/env bash
# Restore a backup into a clean stack.
#
#   RESTORE_SNAPSHOT=latest ./deploy/backup/restore.sh
#
# DESTRUCTIVE: stops the app/Forgejo, recreates both databases, replaces the
# Forgejo data volume and restarts. Rehearse this on a throwaway host
# (docs/BACKUP-RESTORE.md).
#
# RESTORE_START_SERVICES controls what starts at the end (default: web forgejo
# caddy). Set it to "forgejo" when only the backend is wanted, e.g. to run the
# web app natively.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE=(docker compose --env-file "$ROOT/.env" -f "$ROOT/deploy/compose.yaml")

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

: "${RESTIC_REPOSITORY:?}"
: "${RESTIC_PASSWORD:?}"
: "${POSTGRES_USER:?}"
RESTORE_SNAPSHOT="${RESTORE_SNAPSHOT:-latest}"
START_SERVICES="${RESTORE_START_SERVICES:-web forgejo caddy}"
KEEP_DB="${KEEP_DB_NAME:-keep}"
command -v restic >/dev/null || {
	echo "restic is required on the host (https://restic.net)" >&2
	exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "restoring snapshot $RESTORE_SNAPSHOT"
restic restore "$RESTORE_SNAPSHOT" --target "$WORK"
SNAPSHOT_DIR="$(dirname "$(find "$WORK" -name forgejo-dump.tar -print -quit)")"
[ -n "$SNAPSHOT_DIR" ] && [ -f "$SNAPSHOT_DIR/forgejo.dump" ] && [ -f "$SNAPSHOT_DIR/keep.dump" ] || {
	echo "snapshot does not contain forgejo-dump.tar, forgejo.dump and keep.dump" >&2
	exit 1
}

mkdir -p "$WORK/extract"
tar -xf "$SNAPSHOT_DIR/forgejo-dump.tar" -C "$WORK/extract"
chmod -R a+rX "$WORK/extract"

echo "stopping application services"
"${COMPOSE[@]}" stop web forgejo >/dev/null 2>&1 || true

echo "starting postgres"
"${COMPOSE[@]}" up -d postgres
# pg_isready also succeeds against the temporary server the entrypoint starts
# during initdb and then shuts down. A real query only succeeds once the final
# server is accepting writes.
for _ in $(seq 1 120); do
	if "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d postgres -tAc 'select 1' >/dev/null 2>&1; then
		break
	fi
	sleep 1
done

echo "recreating databases"
for attempt in $(seq 1 30); do
	if "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
		-c "DROP DATABASE IF EXISTS forgejo WITH (FORCE);" \
		-c "CREATE DATABASE forgejo;" \
		-c "DROP DATABASE IF EXISTS \"$KEEP_DB\" WITH (FORCE);" \
		-c "CREATE DATABASE \"$KEEP_DB\";"; then
		break
	fi
	[ "$attempt" = 30 ] && exit 1
	sleep 1
done

echo "restoring forgejo database"
"${COMPOSE[@]}" exec -T postgres pg_restore -U "$POSTGRES_USER" -d forgejo \
	--no-owner --clean --if-exists <"$SNAPSHOT_DIR/forgejo.dump"

echo "restoring $KEEP_DB database"
"${COMPOSE[@]}" exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$KEEP_DB" \
	--no-owner --clean --if-exists <"$SNAPSHOT_DIR/keep.dump"

echo "restoring forgejo data volume"
# forgejo dump layout: data/ (app data, -> /data/gitea), repos/ (-> /data/git/repositories),
# app.ini, forgejo-db.sql.
"${COMPOSE[@]}" run --rm --no-deps -T \
	-v "$WORK/extract:/restore:ro" --entrypoint sh forgejo -c '
	set -eu
	mkdir -p /data/gitea /data/git/repositories
	cp -a /restore/data/. /data/gitea/
	cp -a /restore/repos/. /data/git/repositories/
	cp -a /restore/app.ini /data/gitea/conf/app.ini
	# A fresh volume is root-owned; Forgejo runs as USER_UID/USER_GID 1000.
	chown -R 1000:1000 /data/gitea /data/git
'

echo "starting services: $START_SERVICES"
# shellcheck disable=SC2086
"${COMPOSE[@]}" up -d $START_SERVICES

echo "waiting for forgejo to become healthy"
for _ in $(seq 1 120); do
	status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
		"$("${COMPOSE[@]}" ps -q forgejo)" 2>/dev/null || echo starting)"
	[ "$status" = healthy ] && break
	sleep 1
done
[ "${status:-}" = healthy ] || {
	echo "forgejo did not become healthy (status: ${status:-unknown})" >&2
	exit 1
}

echo "restore complete - verify login, repositories, issues, PRs and SSH keys"
