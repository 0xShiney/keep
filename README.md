# Keep

A private, self-hosted code forge for one owner-operator. Forgejo is the Git
engine and system of record; a Next.js app is the interface. Built to run on a
single 2 vCPU / 4 GB host behind Caddy with automatic HTTPS.

- **Browse** repositories, trees, files with syntax highlighting, Markdown, commits,
  diffs, branches, tags and comparisons.
- **Collaborate** with issues, labels, comments, pull requests, inline review and
  merge strategies — implemented by Forgejo, surfaced by Keep.
- **Own it**: one Postgres instance, restic backups, digest-pinned images, no
  external services, no telemetry.

> **Status: unverified against a live stack.** The application builds, lints,
> typechecks and passes 159 unit/contract tests, and the UI runs against an
> explicitly-flagged demo backend. Docker is unavailable in the delivery
> environment, so `docker compose up`, real OAuth, git push/clone, E2E,
> accessibility and performance gates have **not** been executed. See
> [docs/PHASES.md](docs/PHASES.md) for the per-phase evidence table.

## Quick start (demo, no Docker)

```bash
pnpm install
cp .env.example .env.local          # then set SESSION_SECRET
# .env.local:
#   KEEP_BACKEND=fixture
#   KEEP_FIXTURE_ACK=1
pnpm dev                            # http://localhost:3000 → "Explore the demo"
```

Demo mode is in-memory and refuses to run without `KEEP_FIXTURE_ACK=1`. It is
never selected as a fallback: `KEEP_BACKEND=forgejo` either talks to Forgejo or
fails.

## Production quick start

Requirements: Docker Engine + Compose, a domain with `app.` and `git.` records
pointing at the host, ports 80/443/2222 open.

```bash
cp .env.example .env && chmod 600 .env    # fill in hosts, passwords, secrets
docker compose -f deploy/compose.yaml up -d postgres forgejo
./deploy/forgejo/bootstrap.sh             # owner + OAuth app → deploy/secrets/oauth.env
# add FORGEJO_CLIENT_ID/SECRET from that file to .env
docker compose -f deploy/compose.yaml up -d --build
```

Full runbook, upgrades and rollback: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Layout

```
app/            Next.js routes (pages + /api/v1 + raw bytes)
components/     design system, shells, repo UI, forms
lib/            auth, forgejo client/mappers, git validators, render, http
server/         services (repos, code, commits, issues, pulls, account, audit)
db/             Drizzle schema + plain-SQL migrations
deploy/         compose, Caddy, Dockerfiles, forgejo bootstrap, backup/restore
docs/           the documentation set below
tests/          unit, contract, e2e, perf
scripts/        migrations, Forgejo spec/type generation, image pinning, env audit
```

## Documentation

| Doc                                      | What it covers                                      |
| ---------------------------------------- | --------------------------------------------------- |
| [ARCHITECTURE](docs/ARCHITECTURE.md)     | Components, request flows, trust boundaries         |
| [DESIGN](docs/DESIGN.md)                 | Tokens, density, components, keyboard model         |
| [DEVELOPMENT](docs/DEVELOPMENT.md)       | Local setup, commands, tests, migrations            |
| [DEPLOYMENT](docs/DEPLOYMENT.md)         | First install, upgrades, rollback, firewall         |
| [SECURITY](docs/SECURITY.md)             | Threat model, headers, CSP, patch routine           |
| [BACKUP-RESTORE](docs/BACKUP-RESTORE.md) | Schedule, retention, drill                          |
| [API](docs/API.md)                       | `/api/v1` endpoints, errors, pagination             |
| [DATABASE](docs/DATABASE.md)             | Tables, ownership, migrations                       |
| [DECISIONS](docs/DECISIONS.md)           | Decision log with versions and sources              |
| [INSPECTION](docs/INSPECTION.md)         | Phase 0 repository/tooling findings                 |
| [PHASES](docs/PHASES.md)                 | Acceptance criteria, evidence, what is not verified |

## Feature status

| Area                                                                        | Status                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| OIDC login, sessions, CSRF, CSP                                             | Implemented — real Forgejo flow unverified               |
| Dashboard, repo CRUD, code browser, commits, diffs, branches, tags, compare | Implemented                                              |
| SSH keys and access tokens UI                                               | Implemented — PAT issuance needs `FORGEJO_ADMIN_TOKEN`   |
| Issues, labels, comments, pull requests, reviews, merge                     | Implemented — workflows unverified live                  |
| Releases                                                                    | Implemented (list + create)                              |
| Insights                                                                    | Implemented over the latest 50 commits (window labelled) |
| Repository search                                                           | Implemented; code/global/issue search is **Planned**     |
| Notifications, webhooks, LFS admin, CI, signatures                          | **Planned** (P2, not started)                            |
| Integration/E2E/a11y/perf suites                                            | Written; **not run** here (no Docker)                    |
| Backup/restore                                                              | Scripted; **drill not run** here                         |

## License

Private project. No license file is included deliberately; add one before any
public distribution.
