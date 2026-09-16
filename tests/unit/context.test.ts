import { describe, expect, it } from "vitest";

import {
  buildCompactionPrompt,
  buildSynthesisPrompt,
  compactMessages,
  contextLimit,
  shouldCompact,
} from "../../src/shared/context";
import type { PaneMessage, PaneState } from "../../src/shared/types";

function makePane(overrides: Partial<PaneState> = {}): PaneState {
  return {
    id: "pane-1",
    name: "Pane 1",
    providerId: "claude-code",
    modelId: "default",
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

const messages = (count: number): PaneMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index}`,
  }));

describe("context limits", () => {
  it("prefers the reported window, then model patterns, then the provider default", () => {
    expect(contextLimit(makePane({ contextWindow: 50_000 }))).toBe(50_000);
    expect(
      contextLimit(makePane({ providerId: "openrouter", modelId: "google/gemini-2.5-pro" })),
    ).toBe(1_048_576);
    expect(contextLimit(makePane({ providerId: "claude-code", modelId: "default" }))).toBe(200_000);
    expect(contextLimit(makePane({ providerId: "ollama", modelId: "llama3" }))).toBeUndefined();
    expect(contextLimit(makePane({ providerId: "openai", modelId: "mystery" }))).toBeUndefined();
  });

  it("compacts only past the threshold and with enough messages", () => {
    const full = { promptTokens: 150_000, completionTokens: 10_000 };
    expect(shouldCompact(makePane({ ...full, messages: messages(6) }))).toBe(true);
    expect(shouldCompact(makePane({ ...full, messages: messages(4) }))).toBe(false);
    expect(shouldCompact(makePane({ promptTokens: 1_000, messages: messages(6) }))).toBe(false);
    expect(shouldCompact(makePane({ ...full, providerId: "ollama", messages: messages(6) }))).toBe(
      false,
    );
  });
});

describe("compaction", () => {
  it("keeps a summary plus the most recent messages", () => {
    const compacted = compactMessages(messages(7), "  the summary ", () => "s1");
    expect(compacted.map((message) => message.id)).toEqual(["s1", "m3", "m4", "m5", "m6"]);
    expect(compacted[0]).toEqual({ id: "s1", role: "system", content: "the summary" });
  });

  it("includes earlier summaries in the compaction transcript", () => {
    const prompt = buildCompactionPrompt([
      { role: "system", content: "old summary" },
      { role: "user", content: "hi" },
    ]);
    expect(prompt).toContain("[Earlier summary]: old summary\n\n[User]: hi");
  });
});

describe("synthesis", () => {
  it("labels every answer with its source", () => {
    const prompt = buildSynthesisPrompt("What is 2+2?", [
      { source: "Claude Code", content: "4" },
      { source: "Ollama · llama3", content: "four" },
    ]);
    expect(prompt).toContain('<response 1 from="Claude Code">\n4\n</response>');
    expect(prompt).toContain('<response 2 from="Ollama · llama3">\nfour\n</response>');
    expect(prompt).toContain("2 AI models answered it");
  });
});
