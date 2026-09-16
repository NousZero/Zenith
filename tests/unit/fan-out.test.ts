import { describe, expect, it } from "vitest";

import { buildFanOutMessages } from "../../src/shared/fan-out";
import type { PaneState } from "../../src/shared/types";

function makePane(overrides: Partial<PaneState> = {}): PaneState {
  return {
    id: "pane-1",
    name: "Pane 1",
    providerId: "openai",
    modelId: "gpt-4o-mini",
    included: true,
    memoryEnabled: false,
    messages: [],
    promptTokens: 0,
    completionTokens: 0,
    lastError: null,
    contextWindow: null,
    projectPath: null,
    agentPath: null,
    planMode: false,
    ...overrides,
  };
}

describe("buildFanOutMessages", () => {
  it("appends the prompt after existing history when memory is off", () => {
    const pane = makePane({ messages: [{ id: "m1", role: "user", content: "earlier" }] });
    expect(buildFanOutMessages(pane, "new prompt", "remember this")).toEqual([
      { role: "user", content: "earlier" },
      { role: "user", content: "new prompt" },
    ]);
  });

  it("prepends memory text as a system message when the pane's toggle is on", () => {
    const pane = makePane({
      memoryEnabled: true,
      messages: [{ id: "m1", role: "user", content: "earlier" }],
    });
    expect(buildFanOutMessages(pane, "new prompt", "remember this")).toEqual([
      { role: "system", content: "remember this" },
      { role: "user", content: "earlier" },
      { role: "user", content: "new prompt" },
    ]);
  });

  it("skips the memory message when memory text is blank even if the toggle is on", () => {
    const pane = makePane({ memoryEnabled: true });
    expect(buildFanOutMessages(pane, "new prompt", "   ")).toEqual([
      { role: "user", content: "new prompt" },
    ]);
  });

  it("combines persona and enabled memory into one system message", () => {
    const pane = makePane({ memoryEnabled: true });
    expect(buildFanOutMessages(pane, "hi", "remember this", " be brief ")).toEqual([
      { role: "system", content: "be brief\n\nremember this" },
      { role: "user", content: "hi" },
    ]);
  });
});
