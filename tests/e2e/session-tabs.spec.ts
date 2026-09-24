import { expect, test, type Page } from "@playwright/test";

import { launchApp } from "./support/electron-app";

const FIRST_PROMPT = "Explain the build scripts in this repo.";
const closeKey = process.platform === "darwin" ? "Meta+w" : "Control+w";

// Gives the session the app started with a name and one message, then reloads so the app opens
// it, the same way set-project-folder seeds a session.
async function seedFirstSession(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.zenith.sessions.list().then((list) => list.length)))
    .toBeGreaterThan(0);
  await page.evaluate(async (prompt) => {
    const [summary] = await window.zenith.sessions.list();
    const session = summary && (await window.zenith.sessions.load(summary.id));
    const pane = session?.panes[0];
    if (!session || !pane) throw new Error("No session to seed.");
    session.name = "Build scripts";
    pane.messages = [{ id: crypto.randomUUID(), role: "user", content: prompt }];
    await window.zenith.sessions.save(session);
  }, FIRST_PROMPT);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

test("session tabs: open, switch, close with the shortcut, and always keep one open", async () => {
  const { page, close } = await launchApp();
  try {
    await seedFirstSession(page);
    const tabs = page.getByRole("tablist", { name: "Open sessions" });
    const rail = page.getByRole("list", { name: "Sessions" });
    const conversation = page.getByRole("region", { name: "Conversation" });

    await expect(tabs.getByRole("tab", { name: "Build scripts" })).toBeVisible();
    await expect(conversation.getByText(FIRST_PROMPT)).toBeVisible();

    // A second session opens in a new tab, beside the first.
    await page.getByRole("button", { name: "New tab" }).click();
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: "New session" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("What are we working on?")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.zenith.sessions.list().then((list) => list.length)))
      .toBe(2);

    // Clicking a tab switches the transcript.
    await tabs.getByRole("tab", { name: "Build scripts" }).click();
    await expect(conversation.getByText(FIRST_PROMPT)).toBeVisible();
    await tabs.getByRole("tab", { name: "New session" }).click();
    await expect(page.getByText("What are we working on?")).toBeVisible();

    // The shortcut closes the tab; the session stays in the rail and focus moves to its neighbour.
    await page.keyboard.press(closeKey);
    await expect(tabs.getByRole("tab")).toHaveCount(1);
    await expect(conversation.getByText(FIRST_PROMPT)).toBeVisible();
    await expect(rail.getByRole("button", { name: "New session", exact: true })).toBeVisible();

    // Closing the last tab leaves a new, empty session open.
    await tabs.getByRole("button", { name: "Close Build scripts" }).click();
    await expect(tabs.getByRole("tab")).toHaveCount(1);
    await expect(tabs.getByRole("tab", { name: "New session" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("What are we working on?")).toBeVisible();
    await expect(rail.getByRole("button", { name: "Build scripts", exact: true })).toBeVisible();
  } finally {
    await close();
  }
});
