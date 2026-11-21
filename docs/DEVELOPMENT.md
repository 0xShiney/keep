# Development

## Requirements

- Node.js ≥ 20.9 (tested on 26.13) and pnpm 10.34.9 (`corepack enable`)
- Docker Engine + Compose for the real backend, integration tests and E2E
- Playwright browsers for E2E (`pnpm exec playwright install chromium`)
- k6 for performance gates

## Install and run

```bash
pnpm install
cp .env.example .env.local
# for the in-memory demo, set:
#   KEEP_BACKEND=fixture
#   KEEP_FIXTURE_ACK=1
#   SESSION_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')
pnpm dev            # http://localhost:3000
```

`pnpm dev` binds `0.0.0.0:3000`. The login page offers “Explore the demo” only when
the fixture backend is active; the app shows a persistent “Demo data” banner.

## Commands

| Command                     | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                  | Dev server with hot reload                                 |
| `pnpm build` / `pnpm start` | Production build / serve (`output: standalone`)            |
| `pnpm lint`                 | ESLint 9 flat config (`next/core-web-vitals` + TypeScript) |
| `pnpm typecheck`            | `tsc --noEmit`, strict                                     |
| `pnpm test`                 | Vitest unit + contract suites                              |
| `pnpm test:e2e`             | Playwright, needs a live stack and `E2E_*` variables       |
| `pnpm db:migrate`           | Apply `db/migrations/*.sql`                                |
| `pnpm forgejo:spec`         | Download the pinned Forgejo Swagger document               |
| `pnpm forgejo:types`        | Regenerate `lib/forgejo/schema.d.ts`                       |
| `pnpm check:public-env`     | Fail if server-only config leaks into client chunks        |

## Tests

- `tests/unit` — ref/path validators, diff parser, word diff, markdown/XSS,
  authorize matrix, mappers against contract fixtures, crypto/PKCE, Zod schemas,
  and a **route-coverage test** that fails when a handler lacks `authorize()`.
- `tests/contract` — every Forgejo endpoint the client calls must exist in the
  committed 15.0.12 Swagger document; the generated types must match its version.
- `tests/e2e` — the ten acceptance flows plus axe in both themes.
- `tests/perf/k6.js` — NFR thresholds.

Unit and contract suites run offline (159 tests). Everything requiring Forgejo,
Postgres, a browser or a load generator needs Docker and is **not run in the
delivery workspace**.

### Integration suite (planned)

Not written yet: an integration suite using Testcontainers/compose for auth,
repo lifecycle, git over HTTPS/SSH, permissions, issue/PR workflows and mapper
contracts against a live Forgejo. Tracked in [PHASES](PHASES.md); do not claim
integration coverage until it exists.

## Forgejo types

`lib/forgejo/forgejo-swagger.v1.json` is committed (15.0.12, 314 paths).
Regenerate after a deliberate Forgejo upgrade:

```bash
node scripts/fetch-forgejo-spec.mjs v15.0.12   # writes the Swagger doc
pnpm forgejo:types                              # swagger2openapi → openapi-typescript
pnpm typecheck                                  # mappers must still compile
```

The spec is fetched from the release tag's template and version-substituted; do
**not** use a running instance's `/swagger.v1.json` unless it is the pinned
release (a dev build returns `17.0.0-…`, which is how a mismatch was found).

## Migrations

Plain SQL files in `db/migrations/`, applied in filename order by
`scripts/migrate.mjs`, which records name + checksum in `schema_migrations` and
refuses to run if an applied file changed. `db/schema.ts` (Drizzle) must be kept in
sync with the SQL by hand; there is no `drizzle-kit push` in production.

## Conventions

- TypeScript strict; no `any` without a comment. ESLint enforces no `any`.
- Server Components by default; `"use client"` only for interactivity.
- All client mutations go through `/api/v1` with Zod validation and
  `authorize()`; errors are RFC 9457 problem JSON.
- Never log tokens, cookies or file contents.
- Never accept filesystem paths; repository paths go through
  `lib/git/path.ts`, refs through `lib/git/refs.ts`.
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).

## Demo data

`lib/forgejo/fixture-gateway.ts` implements the same gateway interface with three
repositories, commits, a unified diff, issues, a pull request and a release. It is
for UI work and unit tests only; the honest label is “Demo data”, and it can never
be enabled silently.
