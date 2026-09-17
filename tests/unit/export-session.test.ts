import { describe, expect, it } from "vitest";

import { sessionToHtml, sessionToMarkdown } from "../../src/renderer/exportSession";
import type { SessionState } from "../../src/shared/types";

const session: SessionState = {
  id: "s1",
  name: 'Plan <script>alert("x")</script>',
  memoryText: "",
  personalityId: "",
  updatedAt: 0,
  panes: [
    {
      id: "p1",
      name: "Pane",
      providerId: "claude-code",
      modelId: "claude-opus-5",
      included: true,
      messages: [
        { id: "m1", role: "user", content: "Make a table" },
        { id: "m2", role: "assistant", content: "| a | b |\n| - | - |\n| 1 | 2 |" },
      ],
      promptTokens: 0,
      completionTokens: 0,
      lastError: null,
      memoryEnabled: false,
      projectPath: "/work/site",
      agentPath: null,
      planMode: false,
      contextWindow: null,
    },
  ],
};

describe("session export", () => {
  it("writes the conversation as Markdown with the model and folder", () => {
    const markdown = sessionToMarkdown(session);
    expect(markdown).toContain("Claude Code · claude-opus-5");
    expect(markdown).toContain("Project folder: `/work/site`");
    expect(markdown).toContain("## You\n\nMake a table");
    expect(markdown).toContain("## Assistant\n\n| a | b |");
  });

  it("writes a page with no scripts that can't load anything", () => {
    const html = sessionToHtml(session);
    expect(html).toContain("<table>");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script");
    expect(html).toContain("<title>Plan scriptalert(x)/script</title>");
  });
});
