import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { AUTH_STATE, creds, hasCreds } from "./helpers";

/**
 * WCAG 2.2 AA gate: zero serious or critical axe violations on every page, in both
 * themes, plus keyboard-only flows.
 *
 * The app resolves its theme from the `keep_theme` cookie (D-012), not from
 * `prefers-color-scheme`, so each theme pass sets the cookie explicitly.
 */
test.skip(!hasCreds, "needs a live stack (see tests/e2e/helpers.ts)");

// One sign-in per run (see auth.setup.ts): repeated logins hit the app's rate limiter.
test.use({ storageState: AUTH_STATE });

const repo = process.env.E2E_REPO ?? `${creds.username}/keep`;

const PAGES = [
  "/",
  "/new",
  "/settings",
  "/settings/keys",
  "/settings/tokens",
  "/search",
  `/${repo}`,
  `/${repo}/commits`,
  `/${repo}/branches`,
  `/${repo}/issues`,
  `/${repo}/pulls`,
];

for (const theme of ["dark", "light"] as const) {
  test.describe(`${theme} theme`, () => {
    for (const pagePath of PAGES) {
      test(`axe: ${pagePath}`, async ({ page, baseURL }) => {
        await page.context().addCookies([
          { name: "keep_theme", value: theme, url: baseURL ?? "http://localhost:3000" },
        ]);
        await page.goto(pagePath);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const serious = results.violations.filter(
          (violation) => violation.impact === "serious" || violation.impact === "critical",
        );
        expect(
          serious,
          JSON.stringify(
            serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
            null,
            2,
          ),
        ).toEqual([]);
      });
    }
  });
}

test("keyboard: command palette and navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.type("settings");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);
});

test("keyboard: skip link and visible focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
  expect(focused.toLowerCase()).toContain("skip");
});
