import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";
import { reviewBar, sendAndApprove } from "./support/send-and-approve";

const ORIGINAL_README = "# demo\n";

test("undo all: restores README.md after Undo all, then Restore files", async () => {
  const projectPath = createGitProject();
  const readmePath = join(projectPath, "README.md");
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);
    await sendAndApprove(page);

    // The stand-in Claude doesn't write files itself, so change it on disk to simulate the edit.
    writeFileSync(readmePath, "# demo\n\nnotes\n", "utf8");

    const bar = reviewBar(page);
    await bar.getByRole("button", { name: "Undo all" }).click();
    await bar.getByRole("button", { name: "Restore files" }).click();
    await expect(bar).not.toBeVisible();

    await expect.poll(() => readFileSync(readmePath, "utf8")).toBe(ORIGINAL_README);
  } finally {
    await close();
  }
});

test("undo one file: the per-file control restores README.md and the bar disappears", async () => {
  const projectPath = createGitProject();
  const readmePath = join(projectPath, "README.md");
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);
    await sendAndApprove(page);

    writeFileSync(readmePath, "# demo\n\nnotes\n", "utf8");

    const bar = reviewBar(page);
    await bar.getByRole("button", { name: "Undo changes to README.md" }).click();
    await bar.getByRole("button", { name: "Confirm undo of changes to README.md" }).click();
    await expect(bar).not.toBeVisible();

    await expect.poll(() => readFileSync(readmePath, "utf8")).toBe(ORIGINAL_README);
  } finally {
    await close();
  }
});
