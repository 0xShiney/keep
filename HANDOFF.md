# Phase 5 verification — handoff

**State: measured gates complete (2026-11-21).** Docker was available in the later
verification container, so Postgres + Forgejo ran from `deploy/compose.yaml`, the app
ran natively, and k6, backup→restore, E2E and a11y were rerun on that stack.
`docs/PHASES.md` now holds the real numbers. Remaining gaps: the web/Caddy containers
have not been run, merge-strategy coverage is partial, and the upgrade rehearsal is
not done; Phase 1/3/5 therefore stay untagged. Everything below is reproducible.

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

The original delivery VM had no usable Docker API, so the first runs used native versions
(recorded as **D-022**). The later verification container had Docker; the results below were
repeated with Postgres 16.10 and Forgejo 15.0.12 from `deploy/compose.yaml` and the app
(Next 16.4.6) native. The web/Caddy containers were still not started.

### k6 (final run)

- k6 **v0.54.0** installed at `/tmp/bin/k6`. Final run: dashboard p95 **262.76 ms**,
tree **134.50 ms**, commits **283.02 ms**, blob **195.67 ms**, `http_req_failed` **0.00 %**
(1,380 requests, 5 VUs); all thresholds passed.
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

1. Build and run all five compose services on a clean host (web + Caddy included) and
   repeat the restore drill through the containerised app.
2. Exercise every merge strategy against Forgejo; only the default one has live E2E
   coverage.
3. Run the upgrade rehearsal (previous minor → current, rollback).
4. Clear the six remaining lint warnings.

Already done: k6 thresholds pass (dashboard 263 ms, tree 135 ms, commits 283 ms,
blob 196 ms p95, 0 % failures); backup→restore drill passes with a measured 55 s RTO;
`docs/PHASES.md`, `docs/BACKUP-RESTORE.md`, `docs/DEPLOYMENT.md` and the decision log
were updated; `phase-2-complete` is tagged.

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

- Docker Compose: Postgres + Forgejo **run from the committed compose file**; web/Caddy still native/unrun.
- E2E (10 flows) and axe WCAG 2.2 AA (22 scans + 3 keyboard): **passing, measured**.
- Git over HTTPS and SSH (clone + push): **verified against real Forgejo**.
- k6 NFRs: **all four pass**; numbers in `docs/PHASES.md`.
- Backup/restore: **drill passed**, measured RTO **55 s** (`docs/BACKUP-RESTORE.md`).
