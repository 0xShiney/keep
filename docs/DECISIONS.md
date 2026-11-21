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

## D-007 — Opt-in fixture backend for demo and tests

`KEEP_BACKEND=fixture` serves an in-memory forge and requires
`KEEP_FIXTURE_ACK=1` outside tests, including in production. It is never a fallback
for a failing Forgejo and the UI shows a persistent “Demo data” banner. This makes
the UI reviewable without Docker; it is not evidence that the real integration works.

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

## D-011 — CSP: nonce-locked scripts, `style-src 'unsafe-inline'`

Radix and Next inject inline `style` attributes that a nonce cannot cover. Scripts
stay locked with a per-request nonce and `strict-dynamic`; styles allow inline to
avoid breaking primitives. Accepted residual risk (style injection only, no script
execution). Revisit if the primitives drop inline styles.

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

## D-017 — Personal access token issuance uses an admin token + Sudo

Forgejo only issues tokens to a basic-authenticated user, so Keep holds an optional
`FORGEJO_ADMIN_TOKEN` and calls the token API with `Sudo: <login>`. Without it the
tokens page explains the limitation and returns 503 from the API instead of
inventing a flow. Forgejo 15's token list omits `created_at`, so the UI shows “—”.

## D-018 — Inline review comments are addressed by (path, line)

The client never guesses Forgejo diff positions. The server parses the PR diff,
maps the new-file line to a diff position with `newPositionForLine`, and rejects
lines outside the diff with a 400. This keeps the API honest when the diff changes.

## D-019 — Insights use a bounded window

Contributors and activity are computed from the latest ≤50 commits and labelled
“last 50 commits” in the UI. Avoids a background indexing job (forbidden
infrastructure) and keeps the page fast. A Go sidecar for full-history stats
remains an optional Phase 4 spike, not started.

## D-020 — `Idempotency-Key` is recorded, not enforced (accepted gap)

Create endpoints accept and validate the header and record it in the audit entry,
but there is no dedupe store, so a retry can duplicate a write. A single operator
acting through the UI does not retry automatically; an automated client would need
this fixed first. Documented in [API](API.md) rather than silently claimed.

## D-021 — Notifications, webhooks, code search, LFS admin, CI are not started

P2 items. No decision-log approval exists, so no code was written for them. Search
covers repositories only.
