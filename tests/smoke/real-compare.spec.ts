import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { launchApp } from "../e2e/support/electron-app";
import { createGitProject } from "../e2e/support/git-project";
import { setProjectFolder } from "../e2e/support/set-project-folder";
import { approveOnce } from "./approve";

// The flagship feature against real agents: Claude Code and Gemini get the same task side by
// side in their own worktrees, one result is kept, and the project ends up with exactly that
// result and no leftover worktrees or branches.
const TASK =
  "Create a new file named hello.txt in the project root containing exactly the text hi. " +
  "Do not create, modify, or delete any other file. Then reply with the single word done.";

function installed(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("compare Claude Code and Gemini CLI, then keep Claude's result", async () => {
  test.skip(!installed("claude") || !installed("gemini"), "needs both claude and gemini");
  const project = createGitProject();
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: project, stdio: "pipe" }).toString();
  const launched = await launchApp({ realClis: true });
  const { page } = launched;
  try {
    await setProjectFolder(page, project);

    await page.getByRole("button", { name: "Add to message" }).click();
    await page.getByRole("menuitem", { name: "Compare assistants…" }).click();
    const dialog = page.getByRole("dialog", { name: "Compare assistants" });
    await dialog.getByRole("checkbox", { name: "Claude Code" }).click();
    await dialog.getByRole("checkbox", { name: "Gemini CLI" }).click();
    await dialog.getByRole("textbox", { name: "Prompt for every assistant" }).fill(TASK);
    await dialog.getByRole("button", { name: "Compare" }).click();

    const claude = page.getByRole("region", { name: "Claude Code" });
    const gemini = page.getByRole("region", { name: "Gemini CLI" });
    // Approve whatever either agent asks until both have finished.
    const deadline = Date.now() + 200_000;
    const finished = async () =>
      (await claude.getByRole("status").first().innerText()) === "Done" &&
      (await gemini.getByRole("status").first().innerText()) === "Done";
    while (!(await finished()) && Date.now() < deadline) {
      for (const column of [claude, gemini]) await approveOnce(column);
      await page.waitForTimeout(1_000);
    }
    const errors = await page.evaluate(async () => {
      const [summary] = await window.zenith.sessions.list();
      const session = summary && (await window.zenith.sessions.load(summary.id));
      return (session?.panes ?? []).map((pane) => `${pane.providerId}: ${pane.lastError ?? ""}`);
    });
    // An account that can't use an agent is the account's problem, not Zenith's: say so.
    const accountProblem = errors.find((line) =>
      /no longer supported|api key is missing|not authori[sz]ed|credentials|quota/i.test(line),
    );
    test.skip(
      !(await finished()) && accountProblem !== undefined,
      `account problem: ${accountProblem}`,
    );
    const state = async (column: typeof claude) =>
      `${await column.getByRole("status").first().innerText()} ${errors.join(" | ")}`;
    expect(
      await finished(),
      `both agents should finish within 200s.\nClaude — ${await state(claude)}\nGemini — ${await state(gemini)}`,
    ).toBe(true);

    // Both created the file in their own worktree; the project itself is still untouched.
    await expect(claude.getByText("hello.txt")).toBeVisible();
    await expect(gemini.getByText("hello.txt")).toBeVisible();
    expect(existsSync(join(project, "hello.txt"))).toBe(false);

    await claude.getByRole("button", { name: "Keep this one" }).click();
    await expect(page.getByText("Applied Claude Code's changes")).toBeVisible();
    expect(readFileSync(join(project, "hello.txt"), "utf8").trim()).toBe("hi");
    expect(readFileSync(join(project, "README.md"), "utf8")).toBe("# demo\n");
    expect(git("worktree", "list", "--porcelain")).not.toContain("zenith/compare");
    expect(git("branch", "--list", "zenith/*").trim()).toBe("");
  } finally {
    await launched.close();
    rmSync(project, { recursive: true, force: true });
  }
});
