import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturesBin = join(repoRoot, "tests", "fixtures", "bin");
const require = createRequire(import.meta.url);

export interface LaunchedApp {
  app: ElectronApplication;
  // Named `page`, not `window`, so it never shadows the browser-global `window` referenced
  // inside `page.evaluate(() => window.zenith...)` callbacks.
  page: Page;
  userDataDir: string;
  close(): Promise<void>;
}

// Launches the packaged app (npm run package must run first) with the stand-in CLIs on PATH
// and a fresh, isolated user-data-dir so tests never share session state. The real-agent smoke
// suite passes realClis to leave PATH alone, so the installed Claude Code, Gemini, and so on run.
// Passing an earlier launch's userDataDir restarts the app on the same state.
export async function launchApp(
  options: { realClis?: boolean; userDataDir?: string } = {},
): Promise<LaunchedApp> {
  const userDataDir = options.userDataDir ?? mkdtempSync(join(tmpdir(), "zenith-e2e-userdata-"));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
  }
  if (!options.realClis) env["PATH"] = `${fixturesBin}${delimiter}${process.env["PATH"] ?? ""}`;

  const app = await electron.launch({
    executablePath: require("electron") as string,
    args: [repoRoot, `--user-data-dir=${userDataDir}`],
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  return {
    app,
    page,
    userDataDir,
    async close() {
      await app.close().catch(() => undefined);
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}
