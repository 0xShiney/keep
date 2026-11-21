import { expect, type Page } from "@playwright/test";

/**
 * E2E runs against a real deployment (compose) with a real Forgejo identity.
 * Without credentials the specs skip with an explicit reason instead of silently
 * passing against fixture data. See docs/DECISIONS.md (D-013).
 */
export const creds = {
  username: process.env.E2E_USERNAME ?? "",
  password: process.env.E2E_PASSWORD ?? "",
  gitUrl: process.env.E2E_GIT_URL ?? "",
  token: process.env.E2E_TOKEN ?? "",
};

/** Saved session reused by suites that do not need a fresh login. */
export const AUTH_STATE = "test-results/.auth/state.json";

export const hasCreds = Boolean(creds.username && creds.password);

export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: /continue to forgejo/i }).click();
  await page.waitForLoadState("domcontentloaded");

  // Forgejo asks for credentials only when it has no session of its own.
  const username = page.getByLabel(/user name|username/i);
  if (await username.count()) {
    await username.fill(creds.username);
    await page.getByLabel(/^password$/i).fill(creds.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForLoadState("domcontentloaded");
  }

  // First sign-in for an OAuth client shows a consent screen; later sign-ins skip it.
  const authorize = page.getByRole("button", { name: /authorize application/i });
  if (await authorize.count()) {
    await authorize.click();
    await page.waitForLoadState("domcontentloaded");
  }

  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}
