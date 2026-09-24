import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { launchApp } from "./support/electron-app";
import { createGitProject } from "./support/git-project";
import { setProjectFolder } from "./support/set-project-folder";

const PROMPT = "Please look at this project and add some notes.";

test("compare: two assistants run in their own worktrees, and Keep applies one", async () => {
  const projectPath = createGitProject();
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: projectPath, stdio: "pipe" }).toString();
  const { page, close } = await launchApp();
  try {
    await setProjectFolder(page, projectPath);

    await page.getByRole("button", { name: "Add to message" }).click();
    await page.getByRole("menuitem", { name: "Compare assistants…" }).click();
    const dialog = page.getByRole("dialog", { name: "Compare assistants" });
    await dialog.getByRole("checkbox", { name: "Claude Code" }).click();
    await dialog.getByRole("checkbox", { name: "Copilot CLI" }).click();
    await dialog.getByRole("textbox", { name: "Prompt for every assistant" }).fill(PROMPT);
    await dialog.getByRole("button", { name: "Compare" }).click();

    const claude = page.getByRole("region", { name: "Claude Code" });
    const copilot = page.getByRole("region", { name: "Copilot CLI" });
    await expect(claude.getByRole("alertdialog", { name: "Agent approval" })).toBeVisible();
    await expect(copilot.getByRole("status")).toHaveText("Done");

    // Each run has its own worktree on a generated branch; the project itself is untouched.
    const worktrees = git("worktree", "list", "--porcelain");
    const claudePath =
      /worktree (.+)\nHEAD .+\nbranch refs\/heads\/zenith\/compare\/\w+\/claude-code/.exec(
        worktrees,
      )?.[1];
    expect(claudePath).toBeDefined();
    expect(worktrees).toMatch(/refs\/heads\/zenith\/compare\/\w+\/copilot-cli/);

    // The stand-in Claude doesn't write files itself, so make its edits on disk.
    writeFileSync(join(claudePath ?? "", "README.md"), "# demo\n\nnotes\n", "utf8");
    writeFileSync(join(claudePath ?? "", "NOTES.md"), "more notes\n", "utf8");
    await claude.getByRole("button", { name: "Allow", exact: true }).click();

    await expect(claude.getByRole("status")).toHaveText("Done");
    await expect(claude.getByText("2 files changed")).toBeVisible();
    await expect(copilot.getByText("0 files changed")).toBeVisible();
    expect(readFileSync(join(projectPath, "README.md"), "utf8")).toBe("# demo\n");

    await claude.getByRole("button", { name: "Keep this one" }).click();
    await expect(page.getByText("Applied Claude Code's changes")).toBeVisible();

    expect(readFileSync(join(projectPath, "README.md"), "utf8")).toBe("# demo\n\nnotes\n");
    expect(readFileSync(join(projectPath, "NOTES.md"), "utf8")).toBe("more notes\n");
    expect(git("worktree", "list", "--porcelain")).not.toContain("zenith/compare");
    expect(git("branch", "--list", "zenith/*").trim()).toBe("");
    expect(existsSync(claudePath ?? "")).toBe(false);

    await page.getByRole("button", { name: "Back to the conversation" }).click();
    await expect(page.locator("#composer-input")).toBeVisible();
  } finally {
    await close();
  }
});
