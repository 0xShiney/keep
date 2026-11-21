# Phases, acceptance and evidence

Status is deliberately conservative. “Implemented” means code exists and compiles;
“Verified” means it was exercised in this workspace; “Not run” means the required
environment (Docker, a browser, k6) was unavailable.

Environment: 2 vCPU / ~4 GB, Node 26.13, pnpm 10.34.9. **Docker daemon unavailable**,
so no Forgejo/Postgres container, no Playwright browser run, no k6, no restore drill.

## Phase 0 — Inspection: Complete

Repository was empty; tooling and constraints recorded in [INSPECTION](INSPECTION.md).
Verified: `git status`, tool versions, Docker failure.

## Phase 1 — Foundation: Partial (verified offline)

| Criterion                         | Test / check                           | Result      | Evidence                                                        |
| --------------------------------- | -------------------------------------- | ----------- | --------------------------------------------------------------- |
| TypeScript strict compiles        | `pnpm typecheck`                       | **Pass**    | exit 0, no diagnostics                                          |
| Lint clean                        | `pnpm lint`                            | **Pass**    | 0 errors, 6 warnings (see below)                                |
| Production build                  | `pnpm build`                           | **Pass**    | 29 routes incl. `/api/v1/*`, proxy                              |
| Unit + contract tests             | `pnpm test`                            | **Pass**    | 11 files, 159 tests                                             |
| Server starts, health             | `pnpm start` + curl                    | **Pass**    | `/healthz` 200, `/readyz` 200 (fixture mode, explicit)          |
| CSP nonce + headers               | curl `/login`                          | **Pass**    | nonce differs per request; HSTS, nosniff, DENY, Referrer-Policy |
| CSRF on mutations                 | curl foreign Origin                    | **Pass**    | 403                                                             |
| Anonymous access to private paths | curl `/`, `/settings`, `/api/v1/repos` | **Pass**    | 307 → /login, 401 JSON                                          |
| OAuth against real Forgejo        | manual                                 | **Not run** | needs Docker                                                    |
| `docker compose up` clean machine | manual                                 | **Not run** | needs Docker                                                    |
| Sessions in Postgres              | integration                            | **Not run** | no database                                                     |
| Forgejo client + generated types  | contract test                          | **Pass**    | spec 15.0.12, all called endpoints present                      |
| Image digests reproducible        | `node scripts/pin-images.mjs`          | **Pass**    | four digests reproduced exactly                                 |
| No secrets in client bundle       | `pnpm check:public-env`                | **Pass**    | 29 chunks scanned                                               |

Lint warnings: one `<img>` suggestion (avatar), unused constants in two components,
`window.location.assign` in the demo/error affordances, unused `PanelBody`, unused
`eq`. None are correctness issues; they are queued for cleanup rather than suppressed.

## Phase 2 — Core repository experience: Partial (verified offline)

| Criterion                                             | Test / check        | Result      | Evidence                                                                                        |
| ----------------------------------------------------- | ------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| Dashboard, repo pages render                          | curl with session   | **Pass**    | `/`, `/new`, `/settings*`, `/search`, repo tree/blob/commits/branches/issues/pulls all HTTP 200 |
| Repo CRUD API authorization                           | route-coverage test | **Pass**    | every handler calls `authorize()`                                                               |
| Path/ref hostility                                    | curl + unit tests   | **Pass**    | `..`, encoded traversal, NUL, leading `-` → 400/404                                             |
| Raw file policy                                       | curl                | **Pass**    | text → `application/octet-stream` + attachment; PNG inline `image/png`                          |
| Browser, diff, markdown rendering                     | unit tests          | **Pass**    | markdown XSS suite, diff caps, split rows, word diff                                            |
| E2E 1–6 (login, create, clone, push, browse, history) | Playwright          | **Not run** | needs live stack + credentials                                                                  |
| NFR-1..4 (TTFB/LCP/tree/file/commit)                  | k6                  | **Not run** | needs deployment and seeded repo                                                                |
| HTTPS/SSH clone                                       | manual              | **Not run** | needs Forgejo                                                                                   |

## Phase 3 — Collaboration: Partial (implemented, unverified live)

Issues (create/edit/comment/labels/milestones via Forgejo fields), PR create/list/
detail, unified+split diff with lazy budget, inline review comment position mapping,
approve/request-changes, merge strategies, conflict display data.

| Criterion                        | Test       | Result                         |
| -------------------------------- | ---------- | ------------------------------ |
| E2E 7–10                         | Playwright | **Not run**                    |
| PR review position mapping       | unit       | **Pass** (diff position maths) |
| XSS via issue/PR markdown        | unit       | **Pass**                       |
| Merge strategies against Forgejo | manual     | **Not run**                    |

## Phase 4 — Advanced DX: Partial

- Releases: list + create implemented; **asset upload Planned** (checksum test not
  applicable yet).
- Insights: contributors/activity over the latest 50 commits, window labelled;
  matches the gateway data by construction, not compared against a git fixture
  (needs a repo).
- Command palette and shortcuts: implemented (client).
- Search: repositories implemented; issues/PRs/code **Planned**.
- Notifications/webhooks: **not started** (P2, no approval).

## Phase 5 — Hardening: Partial

- Security review: implemented controls documented in [SECURITY](SECURITY.md);
  live boundary tests **Not run**.
- Accessibility: axe + keyboard specs written; **Not run**.
- Performance: k6 script with the blueprint thresholds; **Not run**.
- Backup/restore: scripts written; **drill Not run**.
- Upgrade rehearsal: documented procedure; **Not run**.
- Deployment docs: written, based on the committed stack; clean-machine install
  **Not run**.

## Definition of done — honest scorecard

| Item                                                    | Status                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| 1. Every P0/P1 requirement has a passing automated test | **No** — live tests not executed                    |
| 2. NFR targets met and recorded with numbers            | **No** — not measured                               |
| 3. Security and a11y suites pass                        | **No** — suites written, not run                    |
| 4. Clean-machine install works                          | **Unverified**                                      |
| 5. Backup → wipe → restore drill passes                 | **Not run**                                         |
| 6. Docs current; features labelled honestly             | **Yes**                                             |
| 7. No TODO/FIXME without an issue; no unexplained skips | **Yes** (skips explained in D-013; no TODO markers) |
| 8. P2 not started unless approved                       | **Yes**                                             |

## What to run first on a Docker-capable machine

1. `docker compose -f deploy/compose.yaml up -d --build` → `/readyz` both green.
2. `./deploy/forgejo/bootstrap.sh`, complete login, push a commit.
3. `pnpm test:e2e` with `E2E_*` credentials → record pass/fail per flow.
4. Seed the 10k-file/50k-commit fixture, run `tests/perf/k6.js` → record p95s.
5. Run the restore drill in [BACKUP-RESTORE](BACKUP-RESTORE.md) → record RTO.
6. Only then claim Phase 2/3/5 complete and tag `phase-N-complete`.
