import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { launchApp } from "./support/electron-app";
import { composer } from "./support/send-and-approve";

// A conversation built up on Gemini's 1M window (~300k tokens) moves to Claude Code, whose
// window is 200k. Zenith summarises the earlier part with Claude Code first and says so; the
// stand-in Claude logs the size of every request it gets, so the test can check each one fit.
test("switching to a smaller window summarises the earlier part first, and says so", async () => {
  const log = join(mkdtempSync(join(tmpdir(), "zenith-e2e-chat-log-")), "chat.log");
  const { page, close } = await launchApp({ env: { FAKE_CLAUDE_CHAT_LOG: log } });
  try {
    await expect
      .poll(() => page.evaluate(() => window.zenith.sessions.list().then((list) => list.length)))
      .toBeGreaterThan(0);
    await page.evaluate(async () => {
      const [summary] = await window.zenith.sessions.list();
      const session = summary && (await window.zenith.sessions.load(summary.id));
      const pane = session?.panes[0];
      if (!session || !pane) throw new Error("No session to seed.");
      // 24 messages of 50,000 characters: about 12,500 tokens each.
      pane.messages = Array.from({ length: 24 }, (_, index) => ({
        id: crypto.randomUUID(),
        role: index % 2 === 0 ? "user" : "assistant",
        content: `Message ${index}. ${"lorem ipsum ".repeat(4_166)}`,
      }));
      pane.providerId = "gemini-cli";
      pane.modelId = "default";
      pane.contextWindow = 1_048_576;
      pane.promptTokens = 300_000;
      await window.zenith.sessions.save(session);
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    const conversation = page.getByRole("region", { name: "Conversation" });
    const provider = page.getByRole("combobox", { name: "Provider" });
    await expect(provider).toContainText("Gemini CLI");
    await provider.click();
    await page.getByRole("option", { name: "Claude Code" }).click();

    await composer(page).fill("What did we decide?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(conversation.getByText(/is too long for Claude Code's 200k window/)).toBeVisible();
    await expect(
      conversation.getByText(/summarised the earlier part \(20 messages\)/),
    ).toBeVisible();
    await expect(conversation.getByText("Summary of earlier messages")).toBeVisible();
    // The summary goes as instructions; the last four messages as the transcript.
    await expect(conversation.getByText("Claude Code read 4 earlier messages.")).toBeVisible();

    const requests = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { chars: number }).chars);
    // Summaries of the earlier part, a merge, then the reply; every one inside the window.
    expect(requests.length).toBeGreaterThan(2);
    for (const chars of requests) expect(chars / 4).toBeLessThan(200_000 * 0.8);
  } finally {
    await close();
  }
});
