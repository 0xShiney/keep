#!/usr/bin/env bash
# One-time Forgejo bootstrap: owner account, token-broker service account and
# the OAuth application Keep uses.
#
# Run on the host after `docker compose up -d postgres forgejo`:
#   ./deploy/forgejo/bootstrap.sh
#
# It is idempotent: existing users and OAuth apps are detected and reused, and
# the broker password is rotated on every run.
#
# Why a broker account: Forgejo 15.0.12 mints personal access tokens only for
# HTTP Basic-authenticated admins (`401 auth method not allowed` for token auth),
# so Keep cannot use an admin *token* and must never hold the owner's password.
# The broker is a separate admin account whose random password is readable only
# by Keep's server process. See docs/SECURITY.md and DECISIONS.md D-017.
#
# Credentials are written to deploy/secrets/oauth.env (0600, gitignored) and are
# never printed to stdout.
set -euo pipefail

cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "missing .env; copy .env.example first" >&2; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${KEEP_OWNER_LOGIN:?set KEEP_OWNER_LOGIN in .env}"
: "${KEEP_OWNER_EMAIL:?set KEEP_OWNER_EMAIL in .env}"
: "${KEEP_OWNER_PASSWORD:?set KEEP_OWNER_PASSWORD in .env (>=12 chars)}"
: "${APP_HOST:?set APP_HOST in .env}"

BROKER_LOGIN="${FORGEJO_BROKER_USER:-keep-token-broker}"
BROKER_EMAIL="${FORGEJO_BROKER_EMAIL:-${BROKER_LOGIN}@${APP_HOST}}"
if [ "$(printf '%s' "$BROKER_LOGIN" | tr '[:upper:]' '[:lower:]')" = "$(printf '%s' "$KEEP_OWNER_LOGIN" | tr '[:upper:]' '[:lower:]')" ]; then
	echo "FORGEJO_BROKER_USER must be a separate service account, not the owner login" >&2
	exit 1
fi

compose() { docker compose --env-file .env -f deploy/compose.yaml "$@"; }
# The official image runs as root; the forgejo CLI refuses root, so use the `git`
# account (uid 1000) that owns /data.
forgejo_cli() { compose exec -T --user git forgejo forgejo "$@"; }
mkdir -p deploy/secrets

echo "waiting for Forgejo"
for _ in $(seq 1 60); do
	if compose exec -T forgejo curl -fsS http://127.0.0.1:3000/api/healthz >/dev/null 2>&1; then
		break
	fi
	sleep 2
done

user_exists() {
	forgejo_cli admin user list 2>/dev/null | awk '{print $2}' | grep -qx "$1"
}

if user_exists "$KEEP_OWNER_LOGIN"; then
	echo "owner $KEEP_OWNER_LOGIN already exists"
else
	echo "creating owner $KEEP_OWNER_LOGIN"
	forgejo_cli admin user create \
		--admin \
		--username "$KEEP_OWNER_LOGIN" \
		--password "$KEEP_OWNER_PASSWORD" \
		--email "$KEEP_OWNER_EMAIL" \
		--must-change-password=false
fi

# Random, never printed. Rotated on every bootstrap run.
BROKER_PASSWORD="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))')"
if user_exists "$BROKER_LOGIN"; then
	echo "rotating password for broker account $BROKER_LOGIN"
	forgejo_cli admin user change-password --username "$BROKER_LOGIN" --password "$BROKER_PASSWORD"
	# change-password sets must_change_password, which makes the API return 403.
	forgejo_cli admin user must-change-password --unset "$BROKER_LOGIN"
else
	echo "creating broker account $BROKER_LOGIN"
	forgejo_cli admin user create \
		--admin \
		--username "$BROKER_LOGIN" \
		--password "$BROKER_PASSWORD" \
		--email "$BROKER_EMAIL" \
		--must-change-password=false
fi

# A short-lived token is needed to register/rotate the OAuth application. It is
# deleted as soon as the app exists; it is never used for token issuance.
# Unique name: a previous aborted run may have left a token behind.
BOOTSTRAP_TOKEN_NAME="keep-bootstrap-$(date +%s)-$$"
TOKEN="$(forgejo_cli admin user generate-access-token \
	--username "$KEEP_OWNER_LOGIN" --token-name "$BOOTSTRAP_TOKEN_NAME" --scopes all --raw | tr -d '\r\n')"
[ -n "$TOKEN" ] || { echo "could not create bootstrap token" >&2; exit 1; }

API="http://127.0.0.1:3000/api/v1"
id="$(compose exec -T forgejo curl -fsS -H "Authorization: token $TOKEN" \
	"$API/user/applications/oauth2" |
	node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);const m=a.find(x=>x.name==="Keep");process.stdout.write(m?String(m.id):"")})')"

# The list endpoint never returns client_secret; only the create/PATCH response does,
# so capture the response body of the write instead of re-reading the app.
redirect="${APP_ORIGIN:-https://${APP_HOST}}/api/auth/callback"
if [ -n "$id" ]; then
	echo "OAuth application already exists (id $id); rotating secret"
	APP_JSON="$(compose exec -T forgejo curl -fsS -X PATCH -H "Authorization: token $TOKEN" \
		-H "Content-Type: application/json" \
		-d "{\"name\":\"Keep\",\"redirect_uris\":[\"$redirect\"],\"confidential_client\":true}" \
		"$API/user/applications/oauth2/$id")"
else
	echo "registering OAuth application"
	APP_JSON="$(compose exec -T forgejo curl -fsS -X POST -H "Authorization: token $TOKEN" \
		-H "Content-Type: application/json" \
		-d "{\"name\":\"Keep\",\"redirect_uris\":[\"$redirect\"],\"confidential_client\":true}" \
		"$API/user/applications/oauth2")"
fi

printf '%s' "$APP_JSON" | node -e '
	let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
		const app=JSON.parse(s);
		if(!app.client_id||!app.client_secret){console.error("OAuth app missing client credentials");process.exit(1)}
		require("fs").writeFileSync("deploy/secrets/oauth.env",
			`FORGEJO_CLIENT_ID=${app.client_id}\nFORGEJO_CLIENT_SECRET=${app.client_secret}\n`,
			{mode:0o600});
	});'

# Remove the bootstrap token: it has served its purpose.
compose exec -T forgejo curl -fsS -X DELETE -H "Authorization: token $TOKEN" \
	"$API/users/$KEEP_OWNER_LOGIN/tokens/$BOOTSTRAP_TOKEN_NAME" >/dev/null || true

BROKER_LOGIN="$BROKER_LOGIN" BROKER_PASSWORD="$BROKER_PASSWORD" node -e '
	const fs=require("fs");
	fs.appendFileSync("deploy/secrets/oauth.env",
		`FORGEJO_BROKER_USER=${process.env.BROKER_LOGIN}\nFORGEJO_BROKER_PASSWORD=${process.env.BROKER_PASSWORD}\n`,
		{mode:0o600});
'
chmod 600 deploy/secrets/oauth.env
echo "wrote deploy/secrets/oauth.env — append it to .env (compose does not read it automatically)"
