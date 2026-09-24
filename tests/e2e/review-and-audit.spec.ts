import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";
import { reviewBar, sendAndApprove } from "./support/send-and-approve";

test("approve: the review bar lists README.md, and Keep hides it", async () => {
  const projectPath = createGitProject();
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);
    await sendAndApprove(page);

    const bar = reviewBar(page);
    await expect(bar.getByText("README.md")).toBeVisible();
    await expect(bar.getByRole("button", { name: "See diff" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Undo all" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Keep" })).toBeVisible();

    await bar.getByRole("button", { name: "Keep" }).click();
    await expect(bar).not.toBeVisible();
  } finally {
    await close();
  }
});

test("inline diff: a file chip shows README.md's change under the review bar", async () => {
  const projectPath = createGitProject();
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);
    await sendAndApprove(page);

    // The stand-in Claude doesn't write files itself, so change it on disk to simulate the edit.
    writeFileSync(join(projectPath, "README.md"), "# demo\n\ninline notes\n", "utf8");

    const bar = reviewBar(page);
    const chip = bar.getByRole("button", { name: "README.md", exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-expanded", "true");
    const diff = bar.getByRole("region", { name: "Diff of README.md" });
    await expect(diff.getByText("+inline notes")).toBeVisible();

    await chip.click();
    await expect(diff).not.toBeVisible();
  } finally {
    await close();
  }
});

test("audit log: an approved turn records an approval entry", async () => {
  const projectPath = createGitProject();
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);
    await sendAndApprove(page);

    await expect
      .poll(() =>
        page.evaluate(() =>
          window.zenith.audit
            .list()
            .then((entries) => entries.some((entry) => entry.kind === "approval")),
        ),
      )
      .toBe(true);
  } finally {
    await close();
  }
});
