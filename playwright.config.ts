import { defineConfig } from "@playwright/test";

// Electron E2E suite. Requires a built app (`npm run package`) before running;
// see tests/e2e/support/electron-app.ts for how each test launches it.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
  },
});
