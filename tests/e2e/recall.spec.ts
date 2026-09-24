import { expect, test, type Page } from "@playwright/test";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";
import { approvalCard, composer } from "./support/send-and-approve";

const FACT = "quokka-lantern-7";
const PROMPT = "Which deploy bucket should I use for the release?";

// Saves an older session holding a distinctive fact, beside the one the app has open.
async function seedPastSession(page: Page): Promise<void> {
  await page.evaluate(async (fact) => {
    const [summary] = await window.zenith.sessions.list();
    const open = summary && (await window.zenith.sessions.load(summary.id));
    const pane = open?.panes[0];
    if (!open || !pane) throw new Error("No session to copy.");
    await window.zenith.sessions.save({
      ...open,
      id: crypto.randomUUID(),
      name: "Release notes",
      updatedAt: 1,
      panes: [
        {
          ...pane,
          id: crypto.randomUUID(),
          messages: [
            {
              id: crypto.randomUUID(),
              role: "user",
              content: `For the record, our deploy bucket is named ${fact}.`,
            },
          ],
        },
      ],
    });
  }, FACT);
}

async function whatTheModelSaw(page: Page) {
  await page.getByRole("button", { name: "Pane options" }).click();
  await page.getByRole("menuitem", { name: "What the model saw" }).click();
  const dialog = page.getByRole("dialog", { name: "What the model saw" });
  await expect(dialog.getByText("Latest message")).toBeVisible();
  return dialog;
}

test("recall: adds a matching note from a past session only when switched on", async () => {
  const projectPath = createGitProject();
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);
    await seedPastSession(page);
    const conversation = page.getByRole("region", { name: "Conversation" });

    // Off by default: the prompt goes alone.
    await composer(page).fill(PROMPT);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(approvalCard(page)).toBeVisible();
    let dialog = await whatTheModelSaw(page);
    await expect(dialog).toContainText(PROMPT);
    await expect(dialog).not.toContainText(FACT);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Stop", exact: true }).first().click();
    await expect(approvalCard(page)).toHaveCount(0);

    // Switched on: the outgoing message carries the note, and the sent turn says so.
    await page.getByRole("button", { name: "Pane options" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Recall past sessions/ }).click();
    await composer(page).fill(PROMPT);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(approvalCard(page)).toBeVisible();
    await expect(conversation.getByText("Recalled 1 note from past sessions")).toBeVisible();
    dialog = await whatTheModelSaw(page);
    await expect(dialog.getByText("Notes recalled from past sessions")).toBeVisible();
    await expect(dialog).toContainText(FACT);
    await expect(dialog).toContainText("### Release notes");
  } finally {
    await close();
  }
});
