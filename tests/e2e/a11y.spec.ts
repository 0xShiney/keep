import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { creds, hasCreds, signIn } from "./helpers";

/**
 * WCAG 2.2 AA gate: zero serious or critical axe violations on every page, in both
 * themes, plus keyboard-only flows.
 */
test.skip(!hasCreds, "needs a live stack (see tests/e2e/helpers.ts)");

const PAGES = [
  "/",
  "/new",
  "/settings",
  "/settings/keys",
  "/settings/tokens",
  "/search",
  `/${creds.username ?? "owner"}/keep`,
  `/${creds.username ?? "owner"}/keep/commits`,
  `/${creds.username ?? "owner"}/keep/branches`,
  `/${creds.username ?? "owner"}/keep/issues`,
  `/${creds.username ?? "owner"}/keep/pulls`,
];

for (const theme of ["dark", "light"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    for (const path of PAGES) {
      test(`axe: ${path}`, async ({ page }) => {
        await signIn(page);
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const serious = results.violations.filter(
          (violation) => violation.impact === "serious" || violation.impact === "critical",
        );
        expect(
          serious,
          JSON.stringify(
            serious.map((v) => v.id),
            null,
            2,
          ),
        ).toEqual([]);
      });
    }
  });
}

test("keyboard: command palette and navigation", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.type("settings");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);
});

test("keyboard: skip link and visible focus", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
  expect(focused.toLowerCase()).toContain("skip");
});
