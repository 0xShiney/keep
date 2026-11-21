import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE, hasCreds, signIn } from "./helpers";

/**
 * Signs in once per test run and saves the session cookie. The accessibility
 * suite reuses it: the app rate-limits sign-ins per IP (correct behaviour), so
 * 20+ fresh logins in one minute would be rejected for reasons unrelated to a11y.
 */
setup.skip(!hasCreds, "E2E_USERNAME/E2E_PASSWORD not set: needs a live Forgejo-backed stack");

setup("authenticate", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  await page.context().storageState({ path: AUTH_STATE });
});
