import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { creds, hasCreds, signIn, uniqueName } from "./helpers";

/**
 * The ten acceptance flows from the blueprint, run against a live Forgejo-backed
 * stack. Requires:
 *
 *   E2E_BASE_URL=https://app.example.com \
 *   E2E_GIT_URL=https://git.example.com \
 *   E2E_USERNAME=... E2E_PASSWORD=... E2E_TOKEN=... \
 *   pnpm test:e2e
 *
 * E2E_TOKEN needs `write:repository` (git push) and `write:user` (Forgejo requires
 * it for repository creation).
 */
test.describe.configure({ mode: "serial" });
test.skip(!hasCreds, "E2E_USERNAME/E2E_PASSWORD not set: needs a live Forgejo-backed stack");

const repoName = uniqueName("e2e");
const branchName = "e2e-change";
/** Set by flow 8; Forgejo assigns the number, so later flows must not assume 1. */
let prNumber = 0;

function repoPath(suffix = ""): string {
  return `/${creds.username}/${repoName}${suffix}`;
}

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
  await page.waitForURL(new RegExp(repoPath().replace(/[/.]/g, "\\$&")), { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: repoName }).first()).toBeVisible();
  await expect(page.getByText("Private").first()).toBeVisible();
});

test("3 · clone over HTTPS", async () => {
  test.skip(!creds.gitUrl || !creds.token, "E2E_GIT_URL/E2E_TOKEN not set");
  const work = mkdtempSync(path.join(tmpdir(), "keep-clone-"));
  const url = new URL(`${creds.username}/${repoName}.git`, creds.gitUrl);
  url.username = creds.username;
  url.password = creds.token;
  execFileSync("git", ["clone", url.toString(), path.join(work, "repo")], { stdio: "pipe" });
  const log = execFileSync("git", ["log", "--oneline"], {
    cwd: path.join(work, "repo"),
    encoding: "utf8",
  });
  expect(log.length).toBeGreaterThan(0);
});

test("4 · push commits over HTTPS (main + a feature branch)", async () => {
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
  execFileSync("git", ["push", "origin", "HEAD:main"], { cwd: repo, stdio: "pipe" });

  // The pull-request flows need a head branch that is ahead of main.
  writeFileSync(path.join(repo, "e2e.txt"), "pushed by the suite\nand changed in a branch\n");
  execFileSync("git", ["commit", "-am", "test: e2e change"], { cwd: repo, stdio: "pipe" });
  execFileSync("git", ["push", "origin", `HEAD:refs/heads/${branchName}`], {
    cwd: repo,
    stdio: "pipe",
  });
});

test("5 · browse files with highlighting and markdown", async ({ page }) => {
  await signIn(page);
  await page.goto(repoPath());
  await expect(page.getByRole("link", { name: "e2e.txt" })).toBeVisible();
  await page.getByRole("link", { name: "e2e.txt" }).click();
  await expect(page).toHaveURL(new RegExp(`${repoPath("/blob/main/e2e.txt")}$`));
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByText("e2e.txt"),
  ).toBeVisible();
  await expect(page.getByText("pushed by the suite")).toBeVisible();
  await expect(page.getByRole("link", { name: /download file/i })).toBeVisible();
});

test("6 · inspect history and a commit diff", async ({ page }) => {
  await signIn(page);
  await page.goto(repoPath("/commits"));
  await page.getByText("test: e2e push").first().click();
  await expect(page.getByText("e2e.txt").first()).toBeVisible();
});

test("7 · create an issue", async ({ page }) => {
  await signIn(page);
  await page.goto(repoPath("/issues"));
  await page.getByText("New issue", { exact: true }).click();
  await page.getByLabel(/^title$/i).fill("E2E issue");
  await page.getByLabel(/description/i).fill("Created by Playwright.");
  await page.getByRole("button", { name: /create issue/i }).click();
  await page.waitForURL(new RegExp(`${repoPath("/issues/")}\\d+`));
  await expect(page.getByRole("heading", { name: "E2E issue" })).toBeVisible();
});

test("8 · open a pull request", async ({ page }) => {
  await signIn(page);
  await page.goto(repoPath("/pulls"));
  await page.getByText("New pull request", { exact: true }).click();
  await page.getByLabel(/^title$/i).fill("E2E pull request");
  await page.getByLabel(/description/i).fill("Opened by the E2E suite.");
  await page.getByLabel(/compare \(head\)/i).selectOption(branchName);
  await page.getByRole("button", { name: /create pull request/i }).click();
  await page.waitForURL(new RegExp(`${repoPath("/pulls/")}\\d+`));
  prNumber = Number.parseInt(new URL(page.url()).pathname.split("/").pop() ?? "", 10);
  expect(prNumber).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: /E2E pull request/ })).toBeVisible();
});

test("9 · review with an inline comment (self-approval is refused)", async ({ page }) => {
  await signIn(page);
  await page.goto(repoPath(`/pulls/${prNumber}?tab=files`));
  await expect(page.getByText("e2e.txt").first()).toBeVisible();

  // Inline comment anchored to the new file line, submitted as a comment review.
  await page.getByLabel(/line number in the new file/i).fill("1");
  await page.getByLabel(/^inline comment$/i).fill("Line one looks right.");
  await page.getByRole("button", { name: /^add$/i }).click();
  await page.getByRole("button", { name: /comment only/i }).click();
  await expect(page.getByText(/review comment submitted/i)).toBeVisible();

  await page.goto(repoPath(`/pulls/${prNumber}`));
  await expect(page.getByText("Line one looks right.")).toBeVisible();

  // Forgejo forbids approving your own pull; Keep must explain that instead of
  // reporting a generic upstream conflict.
  await page.getByLabel(/line number in the new file/i).fill("1");
  await page.getByLabel(/^inline comment$/i).fill("approved by author");
  await page.getByRole("button", { name: /^add$/i }).click();
  await page.getByRole("button", { name: /approve/i }).click();
  await expect(page.getByText(/does not allow approving your own pull request/i)).toBeVisible();
});

test("10 · merge the pull request", async ({ page }) => {
  await signIn(page);
  await page.goto(repoPath(`/pulls/${prNumber}`));
  await page.getByRole("button", { name: /merge with squash/i }).click();
  await expect(page.getByText(/has been merged/i)).toBeVisible();
});
