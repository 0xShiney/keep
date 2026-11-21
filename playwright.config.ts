import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Signs in once so the a11y suite does not trip the app's login rate limiter.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium-dark",
      testIgnore: [/auth\.setup\.ts/, /a11y\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
    {
      name: "a11y",
      testMatch: /a11y\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next start --hostname 127.0.0.1 --port ${PORT}`,
        url: `${BASE_URL}/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
