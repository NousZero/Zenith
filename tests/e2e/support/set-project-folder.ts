import { expect, type Page } from "@playwright/test";

// The freshly-created session autosaves ~300ms after the app decides there is nothing to
// restore. Point its first pane at a project folder directly through the exposed IPC bridge,
// then reload so the app resumes that session with the folder already set.
export async function setProjectFolder(page: Page, projectPath: string): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.zenith.sessions.list().then((list) => list.length)))
    .toBeGreaterThan(0);

  await page.evaluate(async (path) => {
    const [summary] = await window.zenith.sessions.list();
    if (!summary) throw new Error("No session to update.");
    const session = await window.zenith.sessions.load(summary.id);
    if (!session) throw new Error("Session failed to load.");
    const pane = session.panes[0];
    if (!pane) throw new Error("Session has no pane.");
    pane.projectPath = path;
    await window.zenith.sessions.save(session);
  }, projectPath);

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}
