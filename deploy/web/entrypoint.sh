#!/bin/sh
# Migrate, then serve. Migrations are idempotent and checksum-verified, so a
# restart never re-applies or silently changes history.
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
	echo "applying database migrations"
	i=0
	until node scripts/migrate.mjs; do
		i=$((i + 1))
		if [ "$i" -ge 10 ]; then
			echo "migrations failed after 10 attempts" >&2
			exit 1
		fi
		echo "database not ready, retrying in 3s ($i/10)"
		sleep 3
	done
else
	echo "DATABASE_URL is empty: skipping migrations (sessions will use memory store)" >&2
fi

exec node server.js
