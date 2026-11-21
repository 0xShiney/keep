#!/usr/bin/env bash
# One-time Forgejo bootstrap: owner account + OAuth application for Keep.
#
# Run on the host after `docker compose up -d postgres forgejo`:
#   ./deploy/forgejo/bootstrap.sh
#
# It is idempotent: existing users and OAuth apps are detected and reused.
# Credentials are written to deploy/secrets/oauth.env (0600, gitignored) and are
# never printed to stdout.
#
# NOT VERIFIED IN THIS WORKSPACE: Docker is unavailable here, so these commands
# have not been executed against a live Forgejo. Verify on first install.
set -euo pipefail

cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "missing .env; copy .env.example first" >&2; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${KEEP_OWNER_LOGIN:?set KEEP_OWNER_LOGIN in .env}"
: "${KEEP_OWNER_EMAIL:?set KEEP_OWNER_EMAIL in .env}"
: "${KEEP_OWNER_PASSWORD:?set KEEP_OWNER_PASSWORD in .env (>=12 chars)}"
: "${APP_HOST:?set APP_HOST in .env}"

compose() { docker compose -f deploy/compose.yaml "$@"; }
mkdir -p deploy/secrets

echo "waiting for Forgejo"
for _ in $(seq 1 60); do
	if compose exec -T forgejo curl -fsS http://127.0.0.1:3000/api/healthz >/dev/null 2>&1; then
		break
	fi
	sleep 2
done

if compose exec -T forgejo forgejo admin user list 2>/dev/null | awk '{print $2}' | grep -qx "$KEEP_OWNER_LOGIN"; then
	echo "owner $KEEP_OWNER_LOGIN already exists"
else
	echo "creating owner $KEEP_OWNER_LOGIN"
	compose exec -T forgejo forgejo admin user create \
		--admin \
		--username "$KEEP_OWNER_LOGIN" \
		--password "$KEEP_OWNER_PASSWORD" \
		--email "$KEEP_OWNER_EMAIL" \
		--must-change-password=false
fi

# A short-lived admin token is needed to register the OAuth application. It is
# deleted as soon as the app exists.
TOKEN="$(compose exec -T forgejo forgejo admin user generate-access-token \
	--username "$KEEP_OWNER_LOGIN" --token-name keep-bootstrap --scopes all --raw | tr -d '\r\n')"
[ -n "$TOKEN" ] || { echo "could not create admin token" >&2; exit 1; }

API="http://127.0.0.1:3000/api/v1"
id="$(compose exec -T forgejo curl -fsS -H "Authorization: token $TOKEN" \
	"$API/user/applications/oauth2" |
	node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);const m=a.find(x=>x.name==="Keep");process.stdout.write(m?String(m.id):"")})')"

if [ -n "$id" ]; then
	echo "OAuth application already exists (id $id); rotating secret"
	compose exec -T forgejo curl -fsS -X PATCH -H "Authorization: token $TOKEN" \
		-H "Content-Type: application/json" \
		"$API/user/applications/oauth2/$id" >/dev/null
else
	echo "registering OAuth application"
	redirect="https://${APP_HOST}/api/auth/callback"
	compose exec -T forgejo curl -fsS -X POST -H "Authorization: token $TOKEN" \
		-H "Content-Type: application/json" \
		-d "{\"name\":\"Keep\",\"redirect_uris\":[\"$redirect\"],\"confidential_client\":true}" \
		"$API/user/applications/oauth2" >/dev/null
fi

compose exec -T forgejo curl -fsS -H "Authorization: token $TOKEN" \
	"$API/user/applications/oauth2" |
	node -e '
		let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
			const app=JSON.parse(s).find(a=>a.name==="Keep");
			if(!app||!app.client_id||!app.client_secret){console.error("OAuth app missing client credentials");process.exit(1)}
			require("fs").writeFileSync("deploy/secrets/oauth.env",
				`FORGEJO_CLIENT_ID=${app.client_id}\nFORGEJO_CLIENT_SECRET=${app.client_secret}\n`,{mode:0o600});
		});'

# Remove the bootstrap token: it has served its purpose.
compose exec -T forgejo curl -fsS -X DELETE -H "Authorization: token $TOKEN" \
	"$API/users/$KEEP_OWNER_LOGIN/tokens/keep-bootstrap" >/dev/null || true

chmod 600 deploy/secrets/oauth.env
echo "wrote deploy/secrets/oauth.env — add it to .env (compose does not read it automatically)"
