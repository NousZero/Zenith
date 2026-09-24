import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { launchApp } from "../e2e/support/electron-app";
import { createGitProject } from "../e2e/support/git-project";
import { composer, reviewBar } from "../e2e/support/send-and-approve";

// One small, checkable task per real agent: create a file, then undo the reply and see it go.
// Proves the part the stand-in suite can't: that each installed CLI still speaks the protocol
// Zenith expects, asks for approval where it should, and that undo covers what it wrote.
const TASK =
  "Create a new file named hello.txt in the project root containing exactly the text hi. " +
  "Do not create, modify, or delete any other file. Then reply with the single word done.";

// Replies that mean the agent's account can't do the task (no entitlement, no quota, signed out).
const ACCOUNT_PROBLEM =
  /authori[sz](?:ed|ation)|credentials|quota|rate limit|sign in|log in|logged out|authenticat|subscription|billing|no longer supported|api key is missing/i;

const AGENTS = [
  { providerId: "claude-code", binary: "claude", label: "Claude Code" },
  { providerId: "gemini-cli", binary: "gemini", label: "Gemini CLI" },
  { providerId: "copilot-cli", binary: "copilot", label: "Copilot CLI" },
  { providerId: "hermes", binary: "hermes", label: "Hermes Agent" },
] as const;

function installed(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

for (const agent of AGENTS) {
  test(`${agent.label}: creates a file on request, and Undo all removes it`, async () => {
    test.skip(!installed(agent.binary), `${agent.binary} is not installed on this computer`);
    const project = createGitProject();
    const launched = await launchApp({ realClis: true });
    const { page } = launched;
    try {
      await expect
        .poll(() => page.evaluate(() => window.zenith.sessions.list().then((list) => list.length)))
        .toBeGreaterThan(0);
      await page.evaluate(
        async ({ path, providerId }) => {
          const [summary] = await window.zenith.sessions.list();
          const session = summary && (await window.zenith.sessions.load(summary.id));
          const pane = session?.panes[0];
          if (!session || !pane) throw new Error("No session to point at the project.");
          pane.projectPath = path;
          pane.providerId = providerId;
          pane.modelId = "default";
          await window.zenith.sessions.save(session);
        },
        { path: project, providerId: agent.providerId },
      );
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      // Zenith moves an empty conversation off an assistant it thinks isn't ready; the first
      // smoke runs "passed" Gemini that way while Claude answered. Check who will answer.
      const answering = await page.evaluate(async () => {
        const [summary] = await window.zenith.sessions.list();
        return summary && (await window.zenith.sessions.load(summary.id))?.panes[0]?.providerId;
      });
      expect(answering, `Zenith switched ${agent.label} to another assistant`).toBe(
        agent.providerId,
      );

      await composer(page).fill(TASK);
      await page.getByRole("button", { name: "Send" }).click();

      // Approve whatever the agent asks until the reply ends. The pane and the composer each have
      // a Stop button while a reply runs; either one showing means it hasn't finished.
      const stop = page.getByRole("button", { name: "Stop", exact: true }).first();
      await expect(stop).toBeVisible();
      const deadline = Date.now() + 200_000;
      while ((await stop.isVisible()) && Date.now() < deadline) {
        const allow = page
          .getByRole("region", { name: "Conversation" })
          .getByRole("button", { name: "Allow", exact: true });
        if (await allow.isVisible()) await allow.first().click();
        await page.waitForTimeout(1_000);
      }
      // A stall notice that names a quota or sign-in problem is the account's, not Zenith's.
      if (await stop.isVisible()) {
        const screen = await page.locator("body").innerText();
        test.skip(
          ACCOUNT_PROBLEM.test(screen),
          `${agent.label} is waiting on its account: ${screen.match(/[^\n]*(?:429|quota|rate limit)[^\n]*/i)?.[0] ?? "quota"}`,
        );
      }
      expect(
        await stop.isVisible(),
        `${agent.label} was still working after 200s. An agent that waits on its own model ` +
          "provider (a quota retry, say) looks like this; check the agent's own logs.",
      ).toBe(false);

      const file = join(project, "hello.txt");
      if (!existsSync(file)) {
        const transcript = await page.getByRole("region", { name: "Conversation" }).innerText();
        // The account, not Zenith, refused: say so as a skip rather than a failure.
        test.skip(
          ACCOUNT_PROBLEM.test(transcript),
          `${agent.label} account problem: ${transcript.split("\n").find((line) => ACCOUNT_PROBLEM.test(line))}`,
        );
        throw new Error(
          `${agent.label} did not create hello.txt. Last reply:\n${transcript.slice(-600)}`,
        );
      }
      expect(readFileSync(file, "utf8").trim()).toBe("hi");

      await reviewBar(page).getByRole("button", { name: "Undo all" }).click();
      await reviewBar(page).getByRole("button", { name: "Restore files" }).click();
      await expect.poll(() => existsSync(file)).toBe(false);
      expect(readFileSync(join(project, "README.md"), "utf8")).toBe("# demo\n");
    } finally {
      await launched.close();
      rmSync(project, { recursive: true, force: true });
    }
  });
}
