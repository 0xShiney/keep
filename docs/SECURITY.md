# Security

Single-operator threat model: the main risks are credential theft, cross-site
scripting through repository content, private-repository leakage, and supply-chain
compromise of the Git engine or images.

## Identity and sessions

- Forgejo is the identity provider (OAuth2/OIDC, Authorization Code + **PKCE S256**).
  Keep never receives or stores passwords; the login form is Forgejo's.
- `state` and the PKCE verifier live in an encrypted, HttpOnly, SameSite=Lax cookie
  with a 10-minute lifetime.
- Sessions are server-side. The cookie carries an opaque id; the database stores a
  SHA-256 hash and the AES-256-GCM-encrypted access token (key derived from
  `SESSION_SECRET` via HKDF).
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`, and the `__Host-` prefix when
  `APP_ORIGIN` is HTTPS. Rotated on login; idle (`SESSION_IDLE_MINUTES`) and absolute
  (`SESSION_ABSOLUTE_HOURS`) expiry enforced on every read.
- Sign-out deletes the row (not just the cookie). Individual sessions can be revoked
  from **Settings → Active sessions**.

## Authorization

`lib/auth/authorize.ts` is the single decision point: deny by default, explicit
actions, repository actions mapped to Forgejo permissions (`pull` for reads, `push`
for writes, `admin` for destructive settings). Account actions require the same
user; system actions require `KEEP_OWNER_LOGIN`. Every API handler and server action
calls it; `tests/unit/route-auth-coverage.test.ts` fails if a new handler does not.

Private repositories return **404** rather than 403 when the viewer lacks `pull`, so
the app does not confirm existence. Forgejo applies the same check independently.

## Headers and CSP

`proxy.ts` mints a nonce per request and forwards:

```
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic';
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self' data:; connect-src 'self'; object-src 'none';
base-uri 'none'; form-action 'self'; frame-ancestors 'none';
manifest-src 'self'; upgrade-insecure-requests
```

`style-src 'unsafe-inline'` is required by Radix/Next inline style attributes;
scripts remain nonce-locked with `strict-dynamic` (decision D-011). Static headers:
`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
HSTS (2 years, preload), restrictive `Permissions-Policy`, and
`Cross-Origin-Opener-Policy: same-origin`. `poweredByHeader` is off.

## CSRF and request validation

All mutations require a same-origin `Origin`/`Sec-Fetch-Site` check
(`lib/http/request.ts`) in addition to SameSite cookies. Bodies are validated with
Zod; repository paths pass `normalizeRepoPath` (rejects `..`, NUL, backslashes,
control characters, absolute paths, over-long segments) and refs pass
`assertValidRef` (rejects leading `-`, spaces, `~^:?*[\`, `..`, `@{`, `.lock`,
trailing `/`/`.`). No endpoint accepts a filesystem path.

## Output handling

- Markdown: remark → rehype → `rehype-sanitize` with an explicit allowlist; raw HTML
  is disabled, dangerous protocols removed, links get `rel="noopener noreferrer
nofollow"`, relative links are resolved inside the repository or dropped.
- Code: Shiki on the server; no `dangerouslySetInnerHTML` from repository text except
  the sanitized Markdown output.
- Raw bytes: `application/octet-stream` + `Content-Disposition: attachment` for
  everything except raster images (PNG/JPEG/GIF/WebP/AVIF/ICO/BMP), which are inline
  with `nosniff` and a sandboxing CSP. HTML/SVG are never inline.
- React escapes filenames, commit messages, issue titles and comments by default.

## Rate limiting and brute force

- In-app: login route and `/api/v1` wrapper use a fixed-window limiter keyed by
  hashed client IP (`lib/security/rate-limit.ts`).
- Proxy: Caddy (built with `caddy-ratelimit`) limits `/login`, `/api/auth/*`,
  token routes and git operations per remote host.
- SSH: Forgejo's built-in server on 2222; protect it with a host firewall and
  fail2ban-style rules for repeated auth failures. Key-only access for the owner is
  recommended.

## Secrets

- All secrets live in `.env` (0600, gitignored) or Docker secrets; nothing is
  prefixed `NEXT_PUBLIC_`. `pnpm check:public-env` scans built client chunks for
  secret names and values and fails the build if anything leaks.
- `FORGEJO_ADMIN_TOKEN` is optional and only used server-side to issue personal
  access tokens via the Sudo header. Without it, the tokens panel explains how to
  create tokens in Forgejo instead.
- Logs are structured JSON (pino) with request ids; tokens, cookies, authorization
  headers and file contents are never logged.

## Supply chain

- Images pinned by digest (`deploy/images.lock.json`), resolved via registry APIs.
- Lockfile committed; dependency audit in CI (`pnpm audit --prod` plus review).
- Forgejo spec and generated types committed, so a silent API change is caught by
  `tests/contract`.
- No postinstall scripts beyond the lockfile's recorded set; pnpm blocks unknown
  build scripts.

## Forgejo hardening (compose)

Install lock on, registration disabled, sign-in required to view anything,
private-by-default repositories, Argon2 password hashing, actions/packages/
federation disabled, mailer off, DB sessions, web UI not publicly routed.

## Patch routine (target: 48 hours)

1. **Monitor**: Forgejo security announcements/releases, Next.js advisories, Node
   and Postgres base-image CVEs.
2. **Triage** (same day): read the advisory, decide exposure (is the affected
   feature enabled?), record the decision in [DECISIONS](DECISIONS.md).
3. **Patch** (≤48 h for Forgejo security releases): bump tag + digest, run
   `node scripts/pin-images.mjs`, update compose/Dockerfile, `docker compose up -d
--build`, watch `/readyz`.
4. **Verify**: log in, open a repo, push a commit, check `/readyz`, scan logs for
   errors. For Forgejo, confirm the admin panel version.
5. **Rollback** if unhealthy: restore the pre-upgrade dump (Forgejo migrates its own
   schema) and the previous image digest.
6. **Record**: date, CVE/advisory, version before/after, verification performed.

## Known gaps

- No WAF/bot management beyond Caddy rate limits.
- Audit log covers sessions, repository create/delete/rename and merges, not every
  read.
- Real OAuth, CSRF and private-isolation behaviour is covered by written tests but
  was not exercised against a live Forgejo in the delivery workspace.
