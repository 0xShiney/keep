# Phases, acceptance and evidence

Status is deliberately conservative. “Implemented” means code exists and compiles;
“Verified” means it was exercised in this workspace; “Not run” means the required
environment was unavailable.

Environment: Fedora host, 8 vCPU / ~3.6 GB, Node 26.13, pnpm 10.34.9, Docker 29.1.3.
PostgreSQL 16.10 and Forgejo 15.0.12 ran from `deploy/compose.yaml`; the Next 16.4.6
app ran natively against them; k6 0.54.0. The web and Caddy containers were **not**
started, so a full five-container clean-machine install is still unverified.

## Phase 0 — Inspection: Complete

Repository was empty; tooling and constraints recorded in [INSPECTION](INSPECTION.md).

## Phase 1 — Foundation: Partial

| Criterion                         | Test / check                           | Result   | Evidence                                                        |
| --------------------------------- | -------------------------------------- | -------- | --------------------------------------------------------------- |
| TypeScript strict compiles        | `pnpm typecheck`                       | **Pass** | exit 0, no diagnostics                                          |
| Lint clean                        | `pnpm lint`                            | **Pass** | 0 errors, 6 warnings (see below)                                |
| Production build                  | `pnpm build`                           | **Pass** | 29 routes incl. `/api/v1/*`, proxy                              |
| Unit + contract tests             | `pnpm test`                            | **Pass** | 17 files, 195 tests                                             |
| Server starts, health             | `pnpm start` + curl                    | **Pass** | `/healthz` 200, `/readyz` 200 against real Forgejo + Postgres   |
| CSP nonce + headers               | curl `/login`                          | **Pass** | nonce differs per request; HSTS, nosniff, DENY, Referrer-Policy |
| CSRF on mutations                 | curl foreign Origin                    | **Pass** | 403                                                             |
| Anonymous access to private paths | curl `/`, `/settings`, `/api/v1/repos` | **Pass** | 307 → /login, 401 JSON                                          |
| OAuth against real Forgejo        | Playwright `auth.setup.ts`             | **Pass** | real login + consent, session row written to Postgres           |
| `docker compose up` clean machine | manual                                 | **Partial** | Postgres + Forgejo start from compose; web/Caddy not run as containers |
| Sessions in Postgres              | integration                            | **Pass** | `app_session` rows created, survived backup/restore             |
| Forgejo client + generated types  | contract test                          | **Pass** | spec 15.0.12, all called endpoints present                      |
| Image digests reproducible        | `node scripts/pin-images.mjs`          | **Pass** | four digests reproduced exactly                                 |
| No secrets in client bundle       | `pnpm check:public-env`                | **Pass** | 29 chunks scanned                                               |

Lint warnings: one `<img>` suggestion (avatar), unused constants in two components,
`window.location.assign` in the demo/error affordances, unused `PanelBody`, unused
`eq`. None are correctness issues; they are queued for cleanup rather than suppressed.

## Phase 2 — Core repository experience: Complete

| Criterion                                             | Test / check        | Result   | Evidence                                                                                        |
| ----------------------------------------------------- | ------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| Dashboard, repo pages render                          | E2E + curl          | **Pass** | `/`, `/new`, `/settings*`, `/search`, repo tree/blob/commits/branches/issues/pulls all HTTP 200 |
| Repo CRUD API authorization                           | route-coverage test | **Pass** | every handler calls `authorize()`                                                               |
| Path/ref hostility                                    | curl + unit tests   | **Pass** | `..`, encoded traversal, NUL, leading `-` → 400/404                                             |
| Raw file policy                                       | curl                | **Pass** | text → `application/octet-stream` + attachment; PNG inline `image/png`                          |
| Browser, diff, markdown rendering                     | unit tests          | **Pass** | markdown XSS suite, diff caps, split rows, word diff                                            |
| E2E 1–6 (login, create, clone, push, browse, history) | Playwright          | **Pass** | full suite 10/10 passed in 29.4 s after the restore drill                                       |
| NFR-1..4 (TTFB/LCP/tree/file/commit)                  | k6                  | **Pass** | numbers below, 0.00 % failed requests                                                           |
| HTTPS/SSH clone                                       | manual              | **Pass** | `git ls-remote` over HTTPS and SSH against restored Forgejo                                     |

### k6 result (snapshot after the cache fixes)

`tests/perf/k6.js`, 5 VUs, 1,380 requests, `http_req_failed` 0.00 %:

| Page      | Threshold | Measured p95 |
| --------- | --------- | ------------ |
| dashboard | < 300 ms  | **262.76 ms** |
| tree      | < 250 ms  | **134.50 ms** |
| commits   | < 300 ms  | **283.02 ms** |
| blob      | < 400 ms  | **195.67 ms** |

Tree listings use the git tree API with per-segment traversal; the repo/activity
caches are 30 s and the commit-list cache is 30 s (a push can take up to 30 s to
appear on the commits page). Commit pages are the slowest path because Forgejo's
commit endpoint is CPU-bound: ~200 ms single request, ~1 s for five concurrent.

## Phase 3 — Collaboration: Partial

Issues (create/edit/comment/labels/milestones via Forgejo fields), PR create/list/
detail, unified+split diff with lazy budget, inline review comment position mapping,
approve/request-changes, merge strategies, conflict display data.

| Criterion                        | Test       | Result                                         |
| -------------------------------- | ---------- | ---------------------------------------------- |
| E2E 7–10                         | Playwright | **Pass** — issue, PR, inline review (self-approval refused), merge |
| PR review position mapping       | unit       | **Pass** (diff position maths)                 |
| XSS via issue/PR markdown        | unit       | **Pass**                                       |
| Merge strategies against Forgejo | E2E        | **Partial** — the default merge strategy passed live; others not exercised |

## Phase 4 — Advanced DX: Partial

- Releases: list + create implemented; **asset upload Planned**.
- Insights: contributors/activity over the latest 50 commits, window labelled.
- Command palette and shortcuts: implemented (client).
- Search: repositories implemented; issues/PRs/code **Planned**.
- Notifications/webhooks: **not started** (P2, no approval).

## Phase 5 — Hardening: Partial

- Security review: controls documented in [SECURITY](SECURITY.md); anonymous, CSRF,
  path-ref and route-authorization checks pass; no external penetration test.
- Accessibility: **25 passed** (41.6 s) — 11 pages × 2 themes axe (wcag2a/aa, 21a/aa,
  22aa) + 3 keyboard tests.
- Performance: k6 passes all four thresholds (table above).
- Backup/restore: **drill passed**, measured RTO 55 s (details in
  [BACKUP-RESTORE](BACKUP-RESTORE.md)).
- Upgrade rehearsal: documented procedure; **Not run**.
- Deployment docs: written; Postgres + Forgejo compose path verified, full
  five-container clean-machine install **Not run**.

## Definition of done — honest scorecard

| Item                                                    | Status                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| 1. Every P0/P1 requirement has a passing automated test | **Yes for the 10 P0/P1 user flows**; admin/edge paths stay unit-tested only |
| 2. NFR targets met and recorded with numbers            | **Yes** — k6 p95s above, 0 % failures               |
| 3. Security and a11y suites pass                        | **Yes** — 25 a11y checks, boundary and route-auth tests |
| 4. Clean-machine install works                          | **Unverified** — web/Caddy containers not started   |
| 5. Backup → wipe → restore drill passes                 | **Yes** — 55 s to a signed-in service               |
| 6. Docs current; features labelled honestly             | **Yes**                                             |
| 7. No TODO/FIXME without an issue; no unexplained skips | **Yes** (skips explained in D-013; no TODO markers) |
| 8. P2 not started unless approved                       | **Yes**                                             |

## Remaining work before a full Phase 1/3/5 claim

1. Build and run all five compose services on a clean host (web + Caddy included),
   then repeat the restore drill through the containerised app.
2. Exercise every merge strategy against Forgejo and record the results.
3. Run the upgrade rehearsal (previous minor → current, rollback).
4. Clear the six lint warnings.

Tag `phase-2-complete` covers the fully passing phase. Phase 1/3/5 stay untagged
until the items above are done.
