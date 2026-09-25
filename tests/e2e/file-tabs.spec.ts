import { expect, test, type Page } from "@playwright/test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

function openFilesPage(page: Page) {
  return page
    .getByRole("navigation", { name: "Primary activity" })
    .getByRole("button", { name: "Files", exact: true })
    .click();
}

test("file tabs: open, switch, close with the shortcut, and come back after a restart", async () => {
  const projectPath = createGitProject();
  writeFileSync(join(projectPath, "alpha.md"), "# Alpha\n\nThe alpha file.\n", "utf8");
  writeFileSync(join(projectPath, "beta.txt"), "The beta file.\n", "utf8");
  writeFileSync(join(projectPath, "gamma.txt"), "The gamma file.\n", "utf8");

  const first = await launchApp();
  try {
    const { page } = first;
    await setProjectFolder(page, projectPath);
    await openFilesPage(page);
    const tree = page.getByRole("list", { name: "Project files" });
    const tabs = page.getByRole("tablist", { name: "Open files" });
    const alpha = page.getByText("The alpha file.");
    const beta = page.getByText("The beta file.");

    // Each file clicked in the tree opens in its own tab; clicking one again only focuses it.
    await tree.getByRole("button", { name: "alpha.md" }).click();
    await expect(alpha).toBeVisible();
    await tree.getByRole("button", { name: "beta.txt" }).click();
    await tree.getByRole("button", { name: "gamma.txt" }).click();
    await tree.getByRole("button", { name: "beta.txt" }).click();
    await expect(tabs.getByRole("tab")).toHaveText(["alpha.md", "beta.txt", "gamma.txt"]);
    await expect(tabs.getByRole("tab", { name: "beta.txt" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(beta).toBeVisible();
    await expect(alpha).not.toBeVisible();

    // Switching tabs brings that file back.
    await tabs.getByRole("tab", { name: "alpha.md" }).click();
    await expect(alpha).toBeVisible();
    await expect(beta).not.toBeVisible();

    // The shortcut closes the open file tab and focuses its neighbour.
    await page.keyboard.press(`${modifier}+w`);
    await expect(tabs.getByRole("tab")).toHaveText(["beta.txt", "gamma.txt"]);
    await expect(beta).toBeVisible();

    // The number and Ctrl+Tab keys switch file tabs here, and the Files page stays open.
    await page.keyboard.press(`${modifier}+2`);
    await expect(tabs.getByRole("tab", { name: "gamma.txt" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("The gamma file.")).toBeVisible();
    await page.keyboard.press("Control+Tab");
    await expect(beta).toBeVisible();
    // Let the tabs reach storage before quitting.
    await page.waitForTimeout(500);
  } finally {
    // Quit without removing the user data, so the next launch is a restart.
    await first.app.close().catch(() => undefined);
  }

  // A file deleted while Zenith was closed loses its tab; the rest come back as they were.
  rmSync(join(projectPath, "gamma.txt"));
  const second = await launchApp({ userDataDir: first.userDataDir });
  try {
    const { page } = second;
    await openFilesPage(page);
    const tabs = page.getByRole("tablist", { name: "Open files" });
    await expect(tabs.getByRole("tab")).toHaveText(["beta.txt"]);
    await expect(tabs.getByRole("tab", { name: "beta.txt" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("The beta file.")).toBeVisible();
  } finally {
    await second.close();
    rmSync(projectPath, { recursive: true, force: true });
  }
});
