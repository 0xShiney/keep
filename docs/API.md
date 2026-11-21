# API

Server-side BFF under `/api/v1`. The browser is the only client; there is no public
API contract for third parties. Every route requires a session cookie unless noted.

## Conventions

- **Auth**: session cookie; `apiContext()` loads identity and a Forgejo gateway bound
  to the user's token.
- **Authorization**: exactly one `authorize(identity, action, resource)` call per
  handler; deny by default.
- **Validation**: Zod on params, query and body; repository names
  `^[A-Za-z0-9._-]{1,100}$`; refs via `assertValidRef`; paths via `normalizeRepoPath`.
- **Errors**: RFC 9457 `application/problem+json` with `type`, `title`, `status`,
  `detail`, `requestId`, and `errors[]` for field validation.
- **Pagination**: `limit` (default 30, max 100) and `page` (or `cursor` where the
  upstream supports it); responses include totals when Forgejo provides them.
- **Mutations**: require a same-origin request (`Origin` / `Sec-Fetch-Site`), else 403.
- **Rate limits**: per-IP fixed window in the wrapper; login and token routes have
  tighter buckets, and Caddy adds proxy-level limits.
- **Caching**: `no-store` on authenticated JSON.

## Endpoints

### Repositories

| Method | Path                                             | Notes                                                                                                                         |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/repos`                                  | `q`, `limit`, `page`; visibility-filtered by Forgejo                                                                          |
| POST   | `/api/v1/repos`                                  | `{name, description?, private?, autoInit?, gitignore?, license?}`; honours `Idempotency-Key` (see below)                      |
| GET    | `/api/v1/repos/{owner}/{repo}`                   | 404 when not readable                                                                                                         |
| PATCH  | `/api/v1/repos/{owner}/{repo}`                   | rename/description/visibility/archive; requires admin                                                                         |
| DELETE | `/api/v1/repos/{owner}/{repo}`                   | requires admin + explicit confirmation field                                                                                  |
| GET    | `/api/v1/repos/{owner}/{repo}/branches`          | paginated                                                                                                                     |
| POST   | `/api/v1/repos/{owner}/{repo}/branches`          | `{name, from}`                                                                                                                |
| DELETE | `/api/v1/repos/{owner}/{repo}/branches/{branch}` | protected branches refused by Forgejo                                                                                         |
| GET    | `/api/v1/repos/{owner}/{repo}/tags`              | paginated                                                                                                                     |
| POST   | `/api/v1/repos/{owner}/{repo}/tags`              | `{name, target?, message?}`                                                                                                   |
| DELETE | `/api/v1/repos/{owner}/{repo}/tags/{tag}`        | requires push                                                                                                                 |

### Issues

| Method   | Path                                                    | Notes                                 |
| -------- | ------------------------------------------------------- | ------------------------------------- |
| GET      | `/api/v1/repos/{owner}/{repo}/issues`                   | `state`, `labels`, `q`, pagination    |
| POST     | `/api/v1/repos/{owner}/{repo}/issues`                   | `{title, body?, labels?}`             |
| GET      | `/api/v1/repos/{owner}/{repo}/issues/{number}`          | includes timeline                     |
| PATCH    | `/api/v1/repos/{owner}/{repo}/issues/{number}`          | state, title, body, labels, assignees |
| GET/POST | `/api/v1/repos/{owner}/{repo}/issues/{number}/comments` | `{body}`                              |

### Pull requests

| Method | Path                                                  | Notes                                                                                 |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/api/v1/repos/{owner}/{repo}/pulls`                  | `state`, pagination                                                                   |
| POST   | `/api/v1/repos/{owner}/{repo}/pulls`                  | `{title, body?, head, base, draft?}`                                                  |
| GET    | `/api/v1/repos/{owner}/{repo}/pulls/{number}`         | detail, mergeability                                                                  |
| POST   | `/api/v1/repos/{owner}/{repo}/pulls/{number}/reviews` | `{event: APPROVED\|REQUEST_CHANGES\|COMMENT, body?, comments?: [{path, line, body}]}` |
| POST   | `/api/v1/repos/{owner}/{repo}/pulls/{number}/merge`   | `{style: merge\|squash\|rebase\|fast-forward-only, message?}`                         |

Inline comments are converted from `(path, line)` to Forgejo's diff position
server-side; an invalid line yields a 400 naming the file.

### Releases

| Method | Path                                    | Notes                                               |
| ------ | --------------------------------------- | --------------------------------------------------- |
| GET    | `/api/v1/repos/{owner}/{repo}/releases` | paginated                                           |
| POST   | `/api/v1/repos/{owner}/{repo}/releases` | `{tag, name?, body?, draft?, prerelease?, target?}` |

Asset upload is **Planned** (needs multipart handling and a size cap review).

### Account

| Method   | Path                    | Notes                                                                                           |
| -------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| GET/POST | `/api/v1/keys`          | list / add SSH key `{title, key}` (validated as an OpenSSH public key)                          |
| DELETE   | `/api/v1/keys/{id}`     |                                                                                                 |
| GET/POST | `/api/v1/tokens`        | list / create `{name, scopes}`; requires the broker account (D-017), otherwise 503 with instructions |
| DELETE   | `/api/v1/tokens/{name}` |                                                                                                 |
| DELETE   | `/api/v1/sessions/{id}` | revoke another session of the same user                                                         |
| GET/PUT  | `/api/v1/prefs`         | theme/density/diff mode, stored in `user_pref`                                                  |

### Auth (not under `/api/v1`)

`GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout`,
`POST /api/auth/demo` (only when the fixture backend is explicitly enabled).

## Example problem

```json
{
  "type": "https://keep.local/problems/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "Repository name is invalid",
  "requestId": "0b0f3f8e-6f2c-4e1a-9d3c-5a1f3d2b7c11",
  "errors": [{ "path": "name", "message": "Use letters, numbers, dot, dash or underscore" }]
}
```

## Idempotency

Every `POST` that creates a resource (repos, branches, tags, issues, comments,
pulls, reviews, releases, SSH keys, tokens) honours an optional
`Idempotency-Key` header (`[A-Za-z0-9._-]{8,128}`):

| Situation                                        | Result                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| First request with a key                         | processed normally; response stored for 24 h              |
| Retry, same key and same body                    | stored response replayed with `Idempotent-Replayed: true` |
| Same key, different body                         | `422` `Idempotency-Key reused`                            |
| Retry while the first request is still executing | `409` `Request in progress` (retry after a moment)        |
| Handler fails                                    | reservation released, so a retry can succeed              |
| No header                                        | processed normally (no dedupe)                            |

Keys are scoped per user, method and path, so the same key on two endpoints is
independent. See [DECISIONS](DECISIONS.md) D-020.

## Not implemented

- No OpenAPI document is generated from the route schemas yet; this file is
  maintained by hand.
- Asset upload, code search and webhooks are out of scope for v1.
