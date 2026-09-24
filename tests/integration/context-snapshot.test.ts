import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { describeContext } from "../../src/main/context-snapshot";
import { buildRecallPrompt } from "../../src/shared/history";

describe("context inspector", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), "zenith-context-"));
    await writeFile(join(project, "AGENTS.md"), "Use tabs.");
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  const messages = [
    { role: "system" as const, content: "You are terse." },
    { role: "user" as const, content: "Hi" },
    { role: "assistant" as const, content: "Hello." },
    { role: "user" as const, content: "Fix the bug" },
  ];

  it("shows Zenith's agent prompt, project files, and tools for its own agent", async () => {
    const snapshot = await describeContext({
      providerId: "ollama",
      modelId: "qwen",
      messages,
      projectPath: project,
      planMode: true,
    });
    const labels = snapshot.sections.map((section) => section.label);
    expect(labels).toEqual([
      "Zenith's agent instructions",
      "Soul, profile, role, memory, agent, and plan instructions",
      "Project instructions (AGENTS.md, CLAUDE.md)",
      "Tool definitions (5)",
      "Earlier conversation (2 messages)",
      "Latest message",
    ]);
    // Plan mode offers only the reading tools.
    const tools = snapshot.sections[3]?.text ?? "";
    expect(tools).toContain('"name": "Read"');
    expect(tools).not.toContain('"name": "Edit"');
    expect(snapshot.sections[2]?.text).toContain("Use tabs.");
    expect(snapshot.totalTokens).toBe(
      snapshot.sections.reduce((sum, section) => sum + section.tokens, 0),
    );
    expect(snapshot.note).toContain("MCP");
  });

  it("shows notes recalled from past sessions apart from the latest message", async () => {
    const recalled = buildRecallPrompt("Fix the bug", [
      { sessionName: "Old", paneName: "Pane A", role: "user", content: "The bug is in X.", at: 1 },
    ]);
    const snapshot = await describeContext({
      providerId: "claude-code",
      modelId: "haiku",
      messages: [...messages.slice(0, -1), { role: "user", content: recalled }],
    });
    const recall = snapshot.sections.find(
      (section) => section.label === "Notes recalled from past sessions",
    );
    expect(recall?.text).toContain("The bug is in X.");
    expect(recall?.tokens).toBeGreaterThan(0);
    expect(snapshot.sections.at(-1)).toMatchObject({
      label: "Latest message",
      text: "Fix the bug",
    });
  });

  it("names what a CLI adds itself and leaves out tools for plain chats", async () => {
    const chat = await describeContext({ providerId: "claude-code", modelId: "haiku", messages });
    expect(chat.sections.map((section) => section.label)).toEqual([
      "Soul, profile, role, memory, agent, and plan instructions",
      "Earlier conversation (2 messages)",
      "Latest message",
    ]);
    expect(chat.note).toContain("Claude Code adds its own");

    const agent = await describeContext({
      providerId: "claude-code",
      modelId: "haiku",
      messages,
      projectPath: project,
      allowedTools: ["Read"],
    });
    expect(agent.sections.find((section) => section.label === "Tools allowed")?.text).toBe(
      "Read, TodoWrite",
    );
  });
});
