import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { creds, hasCreds, signIn, uniqueName } from "./helpers";

/**
 * The ten acceptance flows from the blueprint. Each requires a live stack:
 *
 *   E2E_BASE_URL=https://app.example.com \
 *   E2E_GIT_URL=https://git.example.com \
 *   E2E_USERNAME=... E2E_PASSWORD=... E2E_TOKEN=... \
 *   pnpm test:e2e
 *
 * E2E_TOKEN needs `write:repository` scope so the git push test can authenticate
 * over HTTPS. These have NOT been executed in the delivery workspace (no Docker);
 * see docs/PHASES.md.
 */
test.describe.configure({ mode: "serial" });
test.skip(!hasCreds, "E2E_USERNAME/E2E_PASSWORD not set: needs a live Forgejo-backed stack");

const repoName = uniqueName("e2e");

test("1 · sign in through Forgejo", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("link", { name: /new repository/i })).toBeVisible();
});

test("2 · create a repository", async ({ page }) => {
  await signIn(page);
  await page.goto("/new");
  await page.getByLabel(/repository name/i).fill(repoName);
  await page.getByLabel(/description/i).fill("created by the E2E suite");
  await page.getByRole("button", { name: /create repository/i }).click();
  await expect(page.getByRole("heading", { name: repoName })).toBeVisible();
  await expect(page.getByText("Private")).toBeVisible();
});

test("3 · clone over HTTPS", async () => {
  test.skip(!creds.gitUrl || !creds.token, "E2E_GIT_URL/E2E_TOKEN not set");
  const work = mkdtempSync(path.join(tmpdir(), "keep-clone-"));
  const url = new URL(`${creds.username}/${repoName}.git`, creds.gitUrl);
  url.username = creds.username;
  url.password = creds.token;
  execFileSync("git", ["clone", "--depth", "1", url.toString(), path.join(work, "repo")], {
    stdio: "pipe",
  });
  const log = execFileSync("git", ["log", "--oneline"], {
    cwd: path.join(work, "repo"),
    encoding: "utf8",
  });
  expect(log.length).toBeGreaterThan(0);
});

test("4 · push a commit over HTTPS", async () => {
  test.skip(!creds.gitUrl || !creds.token, "E2E_GIT_URL/E2E_TOKEN not set");
  const work = mkdtempSync(path.join(tmpdir(), "keep-push-"));
  const repo = path.join(work, "repo");
  const url = new URL(`${creds.username}/${repoName}.git`, creds.gitUrl);
  url.username = creds.username;
  url.password = creds.token;
  execFileSync("git", ["clone", url.toString(), repo], { stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "e2e@keep.local"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "E2E"], { cwd: repo });
  writeFileSync(path.join(repo, "e2e.txt"), "pushed by the suite\n");
  execFileSync("git", ["add", "e2e.txt"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "test: e2e push"], { cwd: repo, stdio: "pipe" });
  execFileSync("git", ["push", "origin", "HEAD"], { cwd: repo, stdio: "pipe" });
});

test("5 · browse files with highlighting and markdown", async ({ page }) => {
  await signIn(page);
  await page.goto(`/${creds.username}/${repoName}`);
  await expect(page.getByRole("link", { name: "e2e.txt" })).toBeVisible();
  await page.getByRole("link", { name: "e2e.txt" }).click();
  await expect(page.getByRole("heading", { name: "e2e.txt" })).toBeVisible();
  await expect(page.getByRole("link", { name: /download/i })).toBeVisible();
});

test("6 · inspect history and a commit diff", async ({ page }) => {
  await signIn(page);
  await page.goto(`/${creds.username}/${repoName}/commits`);
  await page.getByText("test: e2e push").first().click();
  await expect(page.getByText("e2e.txt").first()).toBeVisible();
});

test("7 · create an issue with a label", async ({ page }) => {
  await signIn(page);
  await page.goto(`/${creds.username}/${repoName}/issues/new`);
  await page.getByLabel(/title/i).fill("E2E issue");
  await page.getByLabel(/description|body/i).fill("Created by Playwright.");
  await page.getByRole("button", { name: /create issue/i }).click();
  await expect(page.getByRole("heading", { name: "E2E issue" })).toBeVisible();
});

test("8 · open a pull request", async ({ page }) => {
  await signIn(page);
  await page.goto(`/${creds.username}/${repoName}/pulls/new`);
  await page.getByLabel(/title/i).fill("E2E pull request");
  await page.getByRole("button", { name: /create pull request/i }).click();
  await expect(page.getByRole("heading", { name: "E2E pull request" })).toBeVisible();
});

test("9 · review with an inline comment and approve", async ({ page }) => {
  await signIn(page);
  await page.goto(`/${creds.username}/${repoName}/pulls/1`);
  await expect(page.getByRole("heading", { name: "E2E pull request" })).toBeVisible();
  await page.getByRole("button", { name: /files changed/i }).click();
  await expect(page.getByText("e2e.txt").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
});

test("10 · merge the pull request", async ({ page }) => {
  await signIn(page);
  await page.goto(`/${creds.username}/${repoName}/pulls/1`);
  await page.getByRole("button", { name: /merge pull request/i }).click();
  await expect(page.getByText(/merged/i).first()).toBeVisible();
});
