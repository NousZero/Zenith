import { expect, test } from "@playwright/test";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";
import { approvalCard, composer, PROMPT } from "./support/send-and-approve";

test("start and send: opens to the empty state, then shows the prompt, actions, and approval card", async () => {
  const projectPath = createGitProject();
  const { page, close } = await launchApp();
  try {
    await expect(page.getByText("What are we working on?")).toBeVisible();

    await setProjectFolder(page, projectPath);
    await expect(page.getByText("What are we working on?")).toBeVisible();

    await composer(page).fill(PROMPT);
    await page.getByRole("button", { name: "Send" }).click();

    // The transcript shows the sent prompt.
    const conversation = page.getByRole("region", { name: "Conversation" });
    await expect(conversation.getByText(PROMPT)).toBeVisible();

    // The agent's to-do list and actions from the stand-in Claude turn.
    const tasks = page.getByRole("list", { name: "Agent tasks" });
    await expect(tasks).toBeVisible();
    await expect(tasks.getByText("Add notes to the README")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Agent actions" }).getByText(/npm test/),
    ).toBeVisible();

    // The Edit tool asks for approval before touching README.md.
    await expect(approvalCard(page)).toBeVisible();
    await expect(approvalCard(page).getByText("Edit README.md")).toBeVisible();
  } finally {
    await close();
  }
});
