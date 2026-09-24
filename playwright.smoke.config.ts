import { defineConfig } from "@playwright/test";

// Real-agent smoke suite: drives the installed Claude Code, Gemini CLI, Copilot CLI, and Hermes
// through one tiny task each. It uses the machine's own sign-ins and a little real quota, so it
// runs by hand before a release (npm run smoke:real), never in CI.
export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
});
