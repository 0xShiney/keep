# Architecture

## Shape

```
browser ──HTTPS──▶ Caddy ──▶ Next.js (app.<domain>)
                     │           │  server-only REST client
                     │           ▼
                     └──▶ Forgejo (git.<domain>) ◀── Postgres (forgejo, keep)
```

Five processes on one host: `caddy`, `web`, `forgejo`, `postgres`, and a one-shot
`backup` profile. Nothing else. No Redis, no queue, no separate API server — those
are forbidden without an approved decision-log entry.

### Responsibilities

| Component               | Owns                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Forgejo 15.0.12 LTS** | Users, repos, git objects, issues, PRs, reviews, labels, milestones, releases, SSH keys, access tokens, notifications, activity |
| **Next.js app**         | Rendering, BFF endpoints, OAuth client, sessions, authorization, markdown/code rendering, preferences, audit log                |
| **Postgres**            | Two databases: `forgejo` (owned by Forgejo) and `keep` (owned by the app)                                                       |
| **Caddy**               | TLS, host routing, request-body caps, proxy-level rate limits                                                                   |
| **restic** (host)       | Encrypted, deduplicated backups of the two `pg_dump` files + Forgejo tar                                                         |

The app **never** stores a second copy of repository data and never shells out to
`git`. Every repository read goes through Forgejo's REST API; every git write is
done by the user's own `git` client against Forgejo over HTTPS or SSH.

## Request flows

### Sign-in (Authorization Code + PKCE)

1. `GET /api/auth/login` creates `state` + `code_verifier`, stores them in an
   encrypted, HttpOnly, 10-minute cookie, redirects to Forgejo
   `/login/oauth/authorize`.
2. Forgejo authenticates the owner (Keep never sees the password) and redirects to
   `/api/auth/callback?code=…&state=…`.
3. The callback verifies `state`, exchanges the code at
   `/login/oauth/access_token` (PKCE S256), reads `/login/oauth/userinfo`, and
   creates a server-side session.
4. The browser receives an opaque session id in a `__Host-` cookie (HTTPS only);
   the access token is AES-256-GCM encrypted in the `app_session` row.
5. Session ids are stored hashed; rotation happens on login and on privilege
   changes. Idle and absolute expiry are enforced server-side.

### Page request

`proxy.ts` mints a per-request CSP nonce → `(app)` layout calls
`pageContext()` → `requireIdentity()` (redirect to `/login` when absent) →
`createGateway(username, token)` → service function → server-rendered React.
Read-only pages stream from the server; no browser ever calls Forgejo.

### API request (`/api/v1`)

`withApi()` wraps every handler: request id, same-origin/CSRF check for mutations,
rate-limit bucket, Zod body parsing, RFC 9457 problem responses, JSON logging.
Handlers call `apiContext()` and **one** `authorize(identity, action, resource)`
before touching data. Repository actions map to Forgejo permissions; account
actions require the same user; system actions require the configured owner.

### Raw bytes

`/…/raw/…` fetches the file through Forgejo server-side and re-serves it with
`Content-Disposition: attachment` and `application/octet-stream`, except a small
allowlist of raster images (`png/jpeg/gif/webp/avif/ico/bmp`), which may render
inline with `nosniff` and a sandboxing CSP. HTML and SVG are never inline.

## Trust boundaries

- **Browser → Caddy → app** is the only public path. Forgejo's web UI is not
  routed publicly; administer it over an SSH tunnel.
- **app → Forgejo** uses the signed-in user's token, so Forgejo enforces access a
  second time. Private repositories that the viewer cannot read return 404, not
  403, so existence is not disclosed.
- **Forgejo → Postgres** stays on the internal Docker network.
- Repository content (Markdown, filenames, commit messages) is untrusted: Markdown
  goes through remark → rehype → strict `rehype-sanitize`; code highlighting is
  server-side Shiki; raw content is attachment-only.

## Failure behaviour

| Failure                  | Behaviour                                                                        |
| ------------------------ | -------------------------------------------------------------------------------- |
| Forgejo unreachable      | Pages show an inline error panel with request id; `/readyz` returns 503          |
| Database unreachable     | Sessions cannot be created; `/readyz` 503; existing pages still read via Forgejo |
| OAuth state/code invalid | Generic failure page, no detail leak, new login required                         |
| Forgejo 404 vs 403       | Both become “not found” for private repositories                                 |
| Diff too large           | Parser caps files/lines/bytes; UI shows “load anyway” per file                   |
| File >1 MB               | Highlighting skipped, served as plain text                                       |
| File >10 MB              | Download path only                                                               |

## Deliberate omissions

- No background workers: activity and insights are computed on request from a
  bounded window (≤50 commits), labelled in the UI.
- No client-side cache of repository data beyond React Query for mutations;
  server components re-read on navigation.
- No API versioning beyond the `/api/v1` prefix; schemas are validated at the edge.

## Related

- [DECISIONS](DECISIONS.md) — why each choice was made, with sources.
- [DATABASE](DATABASE.md) — app schema and ownership.
- [SECURITY](SECURITY.md) — headers, CSP, rate limits, patch routine.
