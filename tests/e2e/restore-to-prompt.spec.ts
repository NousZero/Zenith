import { expect, test } from "@playwright/test";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";
import { composer, PROMPT, sendAndApprove } from "./support/send-and-approve";

test("restore to prompt: cuts the conversation back and returns the prompt to the composer", async () => {
  const projectPath = createGitProject();
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);
    await sendAndApprove(page);

    const conversation = page.getByRole("region", { name: "Conversation" });
    await conversation.getByText(PROMPT).hover();
    const restore = page.getByRole("button", { name: "Restore to here" });
    await restore.click();
    await page.getByRole("button", { name: "Undo this and everything after?" }).click();

    await expect(conversation.getByText(PROMPT)).not.toBeVisible();
    await expect(composer(page)).toHaveValue(PROMPT);
  } finally {
    await close();
  }
});
