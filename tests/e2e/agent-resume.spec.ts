import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";
import { composer, PROMPT, sendAndApprove } from "./support/send-and-approve";

const SECOND = "Now tidy the notes you added.";

interface LoggedRun {
  args: string[];
  prompt: string;
  sessionId: string;
}

test("resume: the second turn continues Claude Code's session, and after a restore it starts over", async () => {
  const projectPath = createGitProject();
  // The stand-in Claude appends each run's arguments and prompt here; launchApp passes the
  // environment on to the app and from there to the CLI.
  const logPath = join(mkdtempSync(join(tmpdir(), "zenith-e2e-claude-log-")), "runs.jsonl");
  process.env["FAKE_CLAUDE_LOG"] = logPath;
  const runs = () =>
    readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as LoggedRun);
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);
    const restoreButtons = page.getByRole("button", { name: "Restore to here" });

    await sendAndApprove(page);
    // Restore buttons show only once the reply has finished.
    await expect(restoreButtons).toHaveCount(1);

    await sendAndApprove(page, SECOND);
    await expect(restoreButtons).toHaveCount(2);
    const [first, second] = runs();
    expect(first?.args.some((arg) => arg.startsWith("--resume"))).toBe(false);
    expect(second?.args).toContain(`--resume=${first?.sessionId}`);
    expect(second?.prompt).toBe(SECOND);

    // Restoring to the second prompt cuts the conversation back to the first turn, which the
    // agent's session has moved past, so the next turn sends the whole conversation again.
    const conversation = page.getByRole("region", { name: "Conversation" });
    await conversation.getByText(SECOND).hover();
    await restoreButtons.last().click();
    await page.getByRole("button", { name: "Undo this and everything after?" }).click();
    await expect(composer(page)).toHaveValue(SECOND);

    await sendAndApprove(page, SECOND);
    await expect(restoreButtons).toHaveCount(2);
    const third = runs()[2];
    expect(third?.args.some((arg) => arg.startsWith("--resume"))).toBe(false);
    expect(third?.prompt).toContain("Here is our conversation so far");
    expect(third?.prompt).toContain(PROMPT);
  } finally {
    delete process.env["FAKE_CLAUDE_LOG"];
    await close();
  }
});
