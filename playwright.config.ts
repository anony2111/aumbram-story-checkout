import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the **production build**, not the dev server.
 *
 * The behaviours under test — streaming, the idempotent order flow, the offline
 * queue — behave differently under dev's double-rendering and on-demand
 * compilation. `webServer` builds and starts the real thing; reuse is allowed
 * locally so an iteration is not a rebuild, but never in CI.
 *
 * One project: a throttled mid-range Android, which is the device the assignment
 * is written about. Desktop layouts are explicitly out of scope.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // The mock backend holds one in-memory cart for one user, so the suite is
  // serial by construction. Making that explicit beats flaky cross-talk.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "moto-g",
      use: {
        ...devices["Pixel 5"],
        locale: "en-IN",
        timezoneId: "Asia/Kolkata",
      },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- --port 3100",
        url: "http://127.0.0.1:3100/api/v1/debug",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
