# Phase 0 — inspection

Date: 2026-11-21. Workspace: `/workspace/chats/31de23869b4e8ea860fcc241`.

## Repository

- `git status` clean; the tree contained only `.git`. No manifests, lockfiles, CI
  configs, README, AGENTS.md/CLAUDE.md/CONTRIBUTING, or agent skills to honour.
- Therefore there were no existing conventions to preserve and no code to overwrite.
  The layout was scaffolded from the blueprint: `app/`, `components/`, `lib/`,
  `server/`, `db/`, `deploy/`, `docs/`, `tests/`, `scripts/`.

## Tooling available

| Tool          | Version   | Note                                                               |
| ------------- | --------- | ------------------------------------------------------------------ |
| Node.js       | 26.13     | satisfies Next 16 (≥20.9)                                          |
| npm           | 11.20     | used only to bootstrap pnpm                                        |
| pnpm          | 10.34.9   | installed to `$HOME/.local/bin`                                    |
| Docker client | 29.1.3    | **daemon unavailable**: `permission denied … /var/run/docker.sock` |
| Git           | available | no commits existed before this work                                |

## Environment constraints

- 2 vCPU / ~4 GB RAM — matches the NFR baseline, but without a Docker daemon there
  is no way to run Forgejo, Postgres, browsers or k6 here.
- Consequence: the real integration surface (OAuth, git push/clone, permissions,
  PR review positions, backup/restore, NFR numbers) is **unverified** in this
  workspace. All such items are labelled Blocked/Not run in [PHASES](PHASES.md).

## Version verification performed

- Forgejo 15.0.12 release + LTS window: forgejo.org/releases.
- Forgejo REST endpoints and payload shapes: the v15.0.12 Swagger document
  (committed at `lib/forgejo/forgejo-swagger.v1.json`, 314 paths).
- Next.js 16.4.6, Tailwind 4.3.5, Drizzle 0.45.4, Shiki 4.6.0, Zod 4.6.7 and the
  rest were pinned in `package.json` and installed successfully with a committed
  `pnpm-lock.yaml`.
- Image digests for Forgejo/Postgres/Caddy/restic resolved through the registries'
  distribution APIs (`scripts/pin-images.mjs`).

## Initial technical debt (recorded, then addressed or logged)

- Type generation from a dev spec — fixed (D-016).
- ESLint config used `FlatCompat` without `@eslint/eslintrc` — replaced with Next
  16's native flat exports.
- Naming a prop `ref` tripped React's compiler lint rules — renamed to `gitRef`.
- No `public/` directory while the Dockerfile copies it — added with `.gitkeep`.
