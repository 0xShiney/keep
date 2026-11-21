# Phase 5 verification — handoff

**State: verification ~80% complete.** All functional/a11y gates pass; k6 was mid-run at handoff;
backup→restore drill, `docs/PHASES.md` update, commit and tag are outstanding.
Everything below is reproducible; nothing depends on this chat's shell surviving.

---

## 1. What is already done (code, uncommitted)

Working tree is dirty (52 paths). `git log -1` = `f6497dc docs: document architecture, operations and verified status`.

### The four requested hardening items — implemented, unit-tested, live-verified

1. **Admin-token / Sudo removal** → `lib/forgejo/token-broker.ts` (new).
   Token minting now uses HTTP Basic auth as a dedicated non-owner admin account
   (`keep-token-broker`, created by `deploy/forgejo/bootstrap.sh`), scoped to `write:user`.
   Residual risk documented in `docs/DECISIONS.md` **D-017**.
   Live evidence: token+Sudo on `POST /users/{u}/tokens` returns
   `401 {"message":"auth method not allowed"}` on Forgejo 15.0.12; Basic-as-broker works
   (GET 200 / POST 201 / DELETE 204). Scoped broker token gets 403 on repository routes.
2. **`Idempotency-Key` enforced on every create endpoint** → `lib/http/idempotency.ts` (new),
   `db/migrations/0002_idempotency.sql`, `db/schema.ts`, 10 route files wrapped in `idempotent()`.
   Postgres + memory stores, 24 h TTL, 60 s stale-pending retake, 422 on body mismatch,
   409 while in flight, replay header. Covered by `tests/unit/idempotency.test.ts`.
3. **Fixture mode hard-fails when `NODE_ENV=production`** → `lib/env.ts` + `tests/unit/env.test.ts`
   (unconditional refusal; dev still requires the ack in `docs/DECISIONS.md` **D-020**).
4. **CSP `style-src` decision logged with removal plan** → `lib/security/csp.ts`,
   `docs/DECISIONS.md` **D-011** (decision, review trigger, removal plan), drift-tested by
   `tests/unit/csp.test.ts`.

### Defects found by running the real stack and fixed at root cause

- Forgejo writes returned `422 Unsupported Content-Type` → `content-type: application/json`
  on all non-GET requests (`lib/forgejo/client.ts`).
- `/{ref}/{path}` routing broken on tree/blob/raw → `splitRefPath()` in `lib/git/path.ts`
  (+ `?ref=` support for raw); `tests/unit/path.test.ts` extended.
- Commit timeline null crash and vague self-approval error mapped in
  `lib/forgejo/http-gateway.ts`.
- **Built-in sshd refused every key**: `FORGEJO__server__BUILTIN_SSH_SERVER_USER` was missing
  from `deploy/compose.yaml` (empty default ⇒ `Permission denied (publickey)`). Fixed in compose;
  this was a real deployment bug, not a local-only issue.
- a11y fixes (real, axe-driven, not test suppressions):
  - light-mode `--fg-subtle`, `--accent`, `--success` darkened to clear 4.5:1 on their tints
    (`app/globals.css`, comments explain why);
  - command-palette trigger accessible name now contains its visible text;
  - user-menu trigger label includes the avatar initial;
  - dashboard activity repo links permanently underlined (`link-in-text-block`);
  - commit short-SHA link uses `sr-only "Commit "` + `title` full SHA instead of a mismatched
    `aria-label`;
  - token scope checkboxes are 24 px (`target-size`).
- E2E: one sign-in per run via `tests/e2e/auth.setup.ts` + `a11y` project in
  `playwright.config.ts`, because the app's login rate limiter (correct behaviour) rejected
  20+ fresh logins per minute. `tests/e2e/helpers.ts` exports `AUTH_STATE`.

Unit baseline: `pnpm typecheck`, `pnpm lint`, `pnpm test` (186), `pnpm build` — all pass.

---

## 2. Verification evidence collected

| Gate | Command | Result |
| --- | --- | --- |
| E2E flows | `pnpm exec playwright test tests/e2e/flows.spec.ts` | **10 passed (18.7 s)** |
| Accessibility | `pnpm exec playwright test tests/e2e/a11y.spec.ts` | **25 passed (29.5 s)** — 11 pages × 2 themes axe (wcag2a/aa, 21a/aa, 22aa) + 3 keyboard tests |
| Git HTTPS | E2E flows 3/4 (clone + push) | pass |
| Git SSH | `git clone ssh://git@127.0.0.1:2222/keep/keep.git` then commit + `git push` | **pass** (with `BUILTIN_SSH_SERVER_USER=git`) |
| Real OAuth | helper drives Forgejo login + "Authorize Application" | pass |
| Unit | `pnpm test` | 186 pass |
| Build | `pnpm build` | pass |

Docker is unusable here (no socket access, `CapEff=0`, no sudo, no TCP API), so the same versions
run natively: Forgejo **15.0.12** (signed release, sha256
`5919d4558a09dab76cae90156aefe09dadbb2d8705324f21df394ca277c925a1`), PostgreSQL **16.15**,
Next 16.4.6. Recorded as **D-022**; compose orchestration itself is still "Not run".

### k6 (in flight at handoff)

- k6 **v0.54.0** installed at `/tmp/bin/k6`.
- Perf fixture pushed: `keep/bench` — **10,001 files** (100 dirs × 100) + **5,000 commits**
  (generated with `git fast-import`, pushed over SSH).
- `tests/perf/k6.js` now also has a `blob` scenario (NFR `<400 ms` had a threshold but no scenario).
- Command that was running:

  ```bash
  COOKIE=$(python3 -c "import json;d=json.load(open('test-results/.auth/state.json'));print('; '.join(f\"{c['name']}={c['value']}\" for c in d['cookies']))")
  /tmp/bin/k6 run -e BASE_URL=http://127.0.0.1:3000 -e COOKIE="$COOKIE" -e REPO=keep/bench tests/perf/k6.js
  ```

- At handoff the log showed dashboard/tree/commits scenarios complete and `blob` ~8 % in.
  **Read the summary from `/tmp/k6.log` if the process survived; otherwise re-run the command
  above (255 s total).** Record p95 per page in `docs/PHASES.md`.
- Cold single request baseline: `/` 46 ms, `/keep/bench/tree/main` **1,097 ms** (first hit, 101
  entries), `/keep/bench/commits` 371 ms, `/keep/bench/blob/main/counter.txt` 49 ms.
  The tree NFR (`<250 ms`) is the one at risk — if p95 fails, fix at source (e.g. batch/cached
  directory listing in the gateway) rather than touching the threshold, and report the number.

---

## 3. Outstanding work

1. **k6**: read `/tmp/k6.log` (or re-run), capture p95 for dashboard/tree/commits/blob and
   `http_req_failed`, compare against 300/250/300/400 ms.
2. **Backup → wipe → restore drill** (not started):
   - `forgejo dump --config /tmp/forge/custom/conf/app.ini --dir /tmp/backup/forgejo --type tar`
     plus `pg_dump -p 5433 forgejo` and `pg_dump -p 5433 keep`.
   - Stop both, move `/tmp/forge/data` and `/tmp/pgdata` aside (or drop/recreate the DBs),
     restore, start, then prove: OAuth login, a repo clone from the restored data, and the
     `keep` DB rows (repos/sessions) intact. Record measured RTO.
3. **`docs/PHASES.md`**: replace the stale "Not run" rows with the evidence above, include the
   measured k6 numbers and the restore RTO, and keep the Docker limitation explicit.
4. **Commit** the working tree (conventional style, e.g.
   `feat: least-privilege token broker, idempotent creates, verified phase 5`), then tag
   `phase-N-complete` **only** for phases whose full acceptance criteria pass.
5. Optional: note in `docs/DEPLOYMENT.md` that `BUILTIN_SSH_SERVER_USER` is mandatory for the
   built-in SSH server (compose already sets it).

---

## 4. Rebuilding the live stack (processes do not survive the runner)

```bash
# Postgres 16.15 on 127.0.0.1:5433 (dbs: forgejo, keep)
LD_LIBRARY_PATH=/tmp/pgroot/usr/lib/x86_64-linux-gnu \
  /tmp/pgroot/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgdata -l /tmp/pg.log \
  -o "-p 5433 -k /tmp -c listen_addresses=127.0.0.1" -w start

# Forgejo on 127.0.0.1:3001 + SSH 2222
cd /tmp/forge && GITEA_WORK_DIR=/tmp/forge nohup ./forgejo web \
  --config /tmp/forge/custom/conf/app.ini > /tmp/forge/forgejo.log 2>&1 &

# Keep on :3000
cd /workspace/chats/31de23869b4e8ea860fcc241
set -a; . ./.env.local; set +a
nohup pnpm start > /tmp/keep-server.log 2>&1 &
```

Restart only Keep: kill the PID from `ss -ltnp | grep ':3000'`, then the last block above.

`/tmp/forge/custom/conf/app.ini` must keep both:
`BUILTIN_SSH_SERVER_USER = git` and `SSH_DOMAIN = localhost`.

### Chromium (axe/E2E) — environment gotcha, already fixed

The playwright Chromium in this image has **no fontconfig config and no fonts**, and any
`<input>` hard-crashes the renderer
(`FATAL:third_party/skia/.../SkFontMgr_FontConfigInterface.cpp:163 Not implemented`).
Libraries and fonts were extracted into `/tmp/chromedeps/root`; `/tmp/deps2/*.deb` sources are
listed below. Always export before Playwright:

```bash
export LD_LIBRARY_PATH=/tmp/chromedeps/root/usr/lib/x86_64-linux-gnu:/tmp/chromedeps/root/lib/x86_64-linux-gnu
export FONTCONFIG_FILE=/tmp/fonts.conf
export FONTCONFIG_PATH=/tmp/chromedeps/root/etc/fonts
```

`/tmp/fonts.conf` points at `/tmp/chromedeps/root/usr/share/fonts` with cache `/tmp/fontcache`.
Extracted debs: `libfontconfig1 libfreetype6 libharfbuzz0b libthai0 libpixman-1-0 libpng16-16t64
libxcb-render0 libavahi-client3 libavahi-common3 libdatrie1 libgraphite2-3 libglib2.0-0t64
libpcre2-8-0 libbrotli1 libbsd0 libmd0 libuuid1 zlib1g fontconfig-config fonts-dejavu-core`
(Ubuntu noble pool; `/tmp/aptidx` holds the Packages indexes).

### E2E environment

```bash
E2E_BASE_URL=http://localhost:3000 E2E_USERNAME=keep E2E_PASSWORD='KeepOwner!2026verify'
E2E_TOKEN=$(cat /tmp/e2e.token) E2E_GIT_URL=http://localhost:3001 E2E_REPO=keep/keep
```

Throwaway local accounts: owner `keep` / `KeepOwner!2026verify`;
broker `keep-token-broker` / `BrokerOnly!2026rotate`. App origin `http://localhost:3000`,
Forgejo `http://localhost:3001`. `.env.local` holds the live config, including
`DATABASE_URL=postgres://postgres@127.0.0.1:5433/keep?sslmode=disable`.
SSH test key: `/tmp/sshkey`; tokens: `/tmp/e2e.token`, `/tmp/admin.token`; OAuth app:
`/tmp/oauth-app.json`.

### Useful logs

`/tmp/keep-server.log`, `/tmp/forge/forgejo.log` (debug), `/tmp/pg.log`, `/tmp/k6.log`,
`/tmp/perfpush.log`. Fixture stream: `/tmp/fixture.fi`; repo source: `/tmp/perfseed`.

---

## 5. Honest status lines for the report

- Docker Compose orchestration: **not run** (environment limitation, D-022) — native equivalents used.
- E2E (10 flows) and axe WCAG 2.2 AA (22 scans + 3 keyboard): **passing, measured**.
- Git over HTTPS and SSH (clone + push): **verified against real Forgejo**.
- k6 NFRs: **measured, numbers still to be read from `/tmp/k6.log`** — do not claim a p95 before
  reading it; tree (`<250 ms`) is the likely failure and needs a source fix, not a threshold edit.
- Backup/restore: **not yet run**; RTO must come from the drill.
