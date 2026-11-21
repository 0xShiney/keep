# Decision log

Every entry records the choice, why, and where it was verified. Versions were
checked against the vendors' documentation/releases on 2026-11-21.

## D-001 — Forgejo 15.0.12 LTS, pinned by digest

Forgejo owns Git and all forge data. 15.0.x is the current LTS line (supported to
mid-2027), so it receives security patches without chasing features.
Image `code.forgejo.org/forgejo/forgejo:15.0.12`, digest
`sha256:9a95f97c…66b2` (resolved via the registry API, reproducible with
`scripts/pin-images.mjs`).
Sources: <https://forgejo.org/releases/>, <https://codeberg.org/forgejo/forgejo>

## D-002 — Next.js 16.4.6, React 19.3.1, TypeScript 5.9.3

Next 16.4.6 is the current patched 16.x at build time. TypeScript is pinned to 5.9.3
rather than a 7.x preview: the compiler powers `tsc --noEmit` in CI and preview
builds are not worth the risk. Tailwind 4.3.5, Zod 4.6.7, Shiki 4.6.0, Drizzle
0.45.4, pino 10.4.0, Vitest 5.1.1, Playwright 1.65.1, ESLint 9.39.2, pnpm 10.34.9.
Sources: <https://nextjs.org/blog>, <https://github.com/vercel/next.js/releases>

## D-003 — Single app, no workspace split

Blueprint allows a “monorepo-free single app”. One `package.json`, directories
`app/ lib/ components/ server/ db/ deploy/ docs/ tests/`. Avoids workspace tooling
and keeps the standalone Docker image small.

## D-004 — Forgejo is the system of record; no duplicated data

The app stores only sessions, preferences, recent repos, saved searches, audit
events and an (unused) render cache. Issues/PRs/keys/tokens are read live through
the API. No second copy to drift, no ORM over Forgejo's schema.

## D-005 — Server-side sessions with hashed ids and encrypted tokens

Opaque session id in an HttpOnly cookie; DB stores SHA-256(id) plus the
AES-256-GCM access token. `__Host-` prefix only when `APP_ORIGIN` is HTTPS (browsers
reject the prefix on http). Rotation on login; idle (120 min) and absolute (720 h)
timeouts; revocation deletes the row.

## D-006 — Passwords are entered at Forgejo, never at Keep

The blueprint's “login form” is satisfied by redirecting to Forgejo's OAuth
authorize page. Keep never handles credentials, so it cannot leak them, and Forgejo
enforces 2FA/password policy. The login screen offers one action: continue to
Forgejo (plus the explicit demo button when fixture mode is on).

## D-007 — Opt-in fixture backend for development only

`KEEP_BACKEND=fixture` serves an in-memory forge. It requires `KEEP_FIXTURE_ACK=1`
when `NODE_ENV=development`, needs no acknowledgement in tests, and is **refused
outright when `NODE_ENV=production`** — no flag overrides that. A production build
must talk to Forgejo, so invented data can never be mistaken for a real forge. It
is never a fallback for a failing Forgejo, and the UI shows a persistent “Demo
data” banner. Unit tests cover all four combinations (`tests/unit/env.test.ts`).

## D-008 — OAuth Authorization Code + PKCE (S256)

Forgejo supports PKCE. `state` and verifier live in an encrypted, short-lived
cookie; the callback verifies state before exchanging the code. No implicit flow.
Sources: Forgejo OAuth2 docs (`/login/oauth/authorize`,
`/login/oauth/access_token`, `/.well-known/openid-configuration`).

## D-009 — Drizzle for typed queries, plain SQL for migrations

Migrations are reviewable SQL applied by a 100-line migrator with checksums;
Drizzle maps rows for the app's six tables. `drizzle-kit` exists for schema
authoring, not for production pushes. This avoids generated-migration drift and
keeps the Forgejo schema untouched.

## D-010 — Highlighting on the server, theme from a cookie

Shiki runs server-side with `github-dark-default`/`github-light-default`, capped at
400 KB per file; larger files render as plain text. The theme is read from the
`keep_theme` cookie (default dark) so HTML, CSS and highlighted tokens agree on the
first paint. An in-process LRU caches rendered HTML; `render_cache` exists for a
future persistent cache keyed by blob SHA + renderer version.

## D-011 — CSP: nonce-locked scripts, `style-src 'self' 'unsafe-inline'`

Radix and Next inject inline `style` attributes (positioning, `transform-origin`,
scroll locks, focus guards). CSP cannot attach a nonce to a style *attribute*, so
`style-src 'self' 'unsafe-inline'` is the only option that keeps the primitives
working without rewriting them. Scripts remain nonce-locked with
`strict-dynamic`; the residual risk is therefore style injection only (visual
spoofing, data exfiltration via CSS selectors), never script execution.

The policy lives in `lib/security/csp.ts` so this exception is explicit, and
`tests/unit/csp.test.ts` fails if the directive changes without this entry being
updated. Justification for accepting it rather than loosening scripts: script
injection is remote code execution, style injection is not.

**Removal plan** (ordered, each step verifiable):

1. Inventory inline `style` usage: render each page with `style-src-attr 'none'`
   and collect violations via CSP reports (or the browser console in dev).
2. Split the directive: `style-src-elem 'self' 'nonce-<x>'` for `<style>` blocks
   (Next already stamps the nonce) and `style-src-attr` for attributes. This
   immediately narrows the exception to attributes only.
3. Replace attribute usage: Radix exposes `data-side`/`data-state` for most
   positioning, and Popover/Tooltip can be given fixed CSS instead of inline
   transforms; move focus-guard `style` into the stylesheet.
4. Once the inventory is empty, set `style-src-attr 'none'` and delete this
   exception from `STYLE_SRC`.

**Review trigger**: any Next.js major upgrade, Radix minor that touches
Popover/Tooltip/DropdownMenu, or the next security review cycle (at least every
90 days). Owner: whoever performs the patch routine in [SECURITY](SECURITY.md).

## D-012 — Theme resolved on the server, not from `prefers-color-scheme`

A system-preference theme would let the server render dark Shiki output for a
light page. Cookie-based theme (default dark) is deterministic; the toggle writes
the cookie and updates `<html data-theme>`.

## D-013 — Live-stack suites are skipped without credentials, not faked

Docker is unavailable in the delivery environment. Integration, Playwright and k6
suites therefore cannot run here. Playwright specs skip with an explicit reason when
`E2E_USERNAME`/`E2E_PASSWORD` are absent; unit and contract suites (159 tests) run
offline. No result in [PHASES](PHASES.md) claims a live-stack pass.

## D-014 — Caddy built with the rate-limit module

Stock Caddy has no `rate_limit` directive. `deploy/caddy/Dockerfile` builds Caddy
2.10.2 with `caddy-ratelimit` via xcaddy. Proxy limits complement the app-level
limiter and protect git smart-HTTP.

## D-015 — Readiness is explicit in demo mode

`/readyz` reports both dependencies separately. In fixture mode it returns 200 with
`mode: "fixture"` for database and Forgejo rather than pretending real services are
healthy; a real deployment with a missing database still returns 503.

## D-016 — Generated types come from the pinned release, not a running instance

The first spec downloaded was a development build (`17.0.0-121`, 331 paths), which
would have documented endpoints and fields the pinned 15.0.12 image may not have.
The committed document is now fetched from the `v15.0.12` tag's Swagger template
(314 paths, version substituted), and `tests/contract` asserts both the version and
every endpoint the gateway calls.

## D-017 — Personal access tokens use an isolated broker service account (not an admin token)

**Earlier design was wrong and is removed.** It held `FORGEJO_ADMIN_TOKEN` and
called `POST /users/{login}/tokens` with `Sudo`. Against the pinned 15.0.12
release that returns `401 {"message":"auth method not allowed"}`: the endpoint
requires HTTP **Basic** authentication, and `IsBasicAuth` is false for token
auth even with Sudo. Verified live (see PHASES Phase 5 evidence); the feature
never worked, so no test was weakened to keep it.

Replacement: a dedicated, non-owner Forgejo admin account (`keep-token-broker`),
created by `deploy/forgejo/bootstrap.sh` with a random 32-char password that is
rotated on every run. Only `lib/forgejo/token-broker.ts` reads
`FORGEJO_BROKER_USER`/`FORGEJO_BROKER_PASSWORD`; it exposes exactly list, create
and revoke, always with `Sudo: <acting user>`, and refuses to run if it is
configured with the owner's login. The owner's own password is never stored, and
Keep still never handles passwords.

Least privilege applied where Forgejo allows it: token **scopes** are restricted
to a 10-entry allowlist (no `all`, no admin scopes) and default to
`read:repository`; requesting an unknown scope is a 400.

Residual risk (accepted, documented): the broker is a full Forgejo admin, because
Forgejo offers no scoped admin credential for token issuance. A leak of
`FORGEJO_BROKER_PASSWORD` could mint tokens for any account. Mitigations:
dedicated account, random 32-char secret, server-side env only, single code path
with no generic request surface, every issuance/revocation logged, rotation is
one `bootstrap.sh` run, and the account can be deleted without touching the
owner. Follow-up (would remove the risk entirely): an upstream Forgejo feature
for scoped token issuance — none exists in 15.x.

When the broker is unconfigured, the API returns 503 with instructions and the UI
shows a warning; it never falls back to a weaker flow. Forgejo 15's token list
omits `created_at`, so the UI shows “—”.

## D-018 — Inline review comments are addressed by (path, line)

The client never guesses Forgejo diff positions. The server parses the PR diff,
maps the new-file line to a diff position with `newPositionForLine`, and rejects
lines outside the diff with a 400. This keeps the API honest when the diff changes.

## D-019 — Insights use a bounded window

Contributors and activity are computed from the latest ≤50 commits and labelled
“last 50 commits” in the UI. Avoids a background indexing job (forbidden
infrastructure) and keeps the page fast. A Go sidecar for full-history stats
remains an optional Phase 4 spike, not started.

## D-020 — `Idempotency-Key` is enforced on every create endpoint

Every create handler (repos, branches, tags, issues, issue comments, pulls,
reviews, releases, SSH keys, tokens) runs inside `idempotent()` from
`lib/http/idempotency.ts`.

The identity is `sha256(userId, method, path, key)`; the fingerprint is
`sha256(method, path, raw body)`. Semantics:

- first request reserves a `pending` row, runs the handler and stores status,
  content type and body for 24 h;
- a retry with the same fingerprint replays that response byte-for-byte with
  `Idempotent-Replayed: true` and does not re-run the handler;
- the same key with a different body is `422` (never a wrong-resource replay);
- a concurrent retry while the first is still running is `409`;
- a thrown handler releases the reservation so a retry can proceed;
- reservations pending for more than 60 s are treated as abandoned and retaken.

No key means normal processing (the header is optional, as in the blueprint). This
adds one app-owned table, `idempotency_record`, which stores no forge data — see
[DATABASE](DATABASE.md). The unit suite exercises replay, conflict, in-flight and
release paths against the same store contract used in production.

## D-021 — Notifications, webhooks, code search, LFS admin, CI are not started

P2 items. No decision-log approval exists, so no code was written for them. Search
covers repositories only.

## D-022 — Live verification uses native Forgejo + PostgreSQL, not Docker

The delivery VM exposes `/var/run/docker.sock` but this account is neither in the
`docker` group nor able to `sudo` (`no_new_privs`, `CapEff=0`), and there is no TCP
Docker API. `docker compose up` therefore cannot run here.

To still verify the stack end to end, Phase 5 runs the same *versions* natively:
Forgejo 15.0.12 from the signed upstream release asset (sha256
`5919d4558a09dab76cae90156aefe09dadbb2d8705324f21df394ca277c925a1`, SQLite build
reported at startup) against PostgreSQL 16.15 (Ubuntu 24.04 package, extracted
without root). The compose file remains the deployment artifact; its images are
still digest-pinned and reproducible, but the compose *orchestration* itself is
labelled Not run. Native runs use the same HTTP/SSH surfaces and the same app
code, so OAuth, git, E2E, a11y, perf and restore results are real.

**Update (2026-11-21):** a later verification container did have a working Docker
daemon. Postgres 16.10 and Forgejo 15.0.12 were then run from `deploy/compose.yaml`,
the app natively against them, and the backup/restore drill and k6 were repeated on
that stack. The web/Caddy containers remain unrun. The native-path details above are
kept as the record of the original constraint.

## D-023 — CSP policy is a module, not a string in middleware

The policy moved to `lib/security/csp.ts` so `tests/unit/csp.test.ts` can assert
every directive and tie the `style-src` exception to D-011's removal plan. This is
test surface for a security control that previously had none.
