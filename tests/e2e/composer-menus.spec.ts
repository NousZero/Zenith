import { expect, test } from "@playwright/test";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";
import { composer } from "./support/send-and-approve";

test("@ file mention: lists project files and Tab completes the mention", async () => {
  const projectPath = createGitProject();
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);

    await composer(page).fill("@RE");
    const fileMenu = page.getByRole("listbox", { name: "Project files" });
    await expect(fileMenu).toBeVisible();
    await expect(fileMenu.getByText("README.md")).toBeVisible();

    await composer(page).press("Tab");
    await expect(composer(page)).toHaveValue("@README.md ");
  } finally {
    await close();
  }
});

test("slash menu: lists commands and Escape clears the composer", async () => {
  const projectPath = createGitProject();
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);

    await composer(page).fill("/");
    const commandMenu = page.getByRole("listbox", { name: "Commands" });
    await expect(commandMenu).toBeVisible();

    await composer(page).press("Escape");
    await expect(commandMenu).not.toBeVisible();
    await expect(composer(page)).toHaveValue("");
  } finally {
    await close();
  }
});
