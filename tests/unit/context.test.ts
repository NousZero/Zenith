import { describe, expect, it } from "vitest";

import {
  buildCompactionPrompt,
  buildSynthesisPrompt,
  chunkMessages,
  contextLimit,
  estimateMessages,
  fitHistory,
  shouldCompact,
  truncateMiddle,
  withPanePatch,
} from "../../src/shared/context";
import { estimateTokens } from "../../src/shared/tokens";
import type { PaneMessage, PaneState } from "../../src/shared/types";
import { fitNotice } from "../../src/renderer/useHarness";

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
  it("prefers the reported window, then model patterns, then a conservative default", () => {
    expect(contextLimit(makePane({ contextWindow: 50_000 }))).toBe(50_000);
    expect(
      contextLimit(makePane({ providerId: "openrouter", modelId: "google/gemini-2.5-pro" })),
    ).toBe(1_048_576);
    expect(contextLimit(makePane({ providerId: "claude-code", modelId: "default" }))).toBe(200_000);
    expect(contextLimit(makePane({ providerId: "ollama", modelId: "llama3" }))).toBe(4_096);
    expect(contextLimit(makePane({ providerId: "openai", modelId: "mystery" }))).toBe(128_000);
  });

  it("forgets the old model's window and counts after a switch", () => {
    const history = [
      { id: "m0", role: "user" as const, content: "x".repeat(4_000) },
      { id: "m1", role: "assistant" as const, content: "y".repeat(4_000) },
    ];
    const onGemini = makePane({
      providerId: "gemini-cli",
      contextWindow: 1_048_576,
      promptTokens: 800_000,
      completionTokens: 2_000,
      messages: history,
    });
    const onClaude = withPanePatch(onGemini, { providerId: "claude-code", modelId: "default" });
    expect(contextLimit(onClaude)).toBe(200_000);
    expect(onClaude.promptTokens).toBe(estimateMessages(history));
    expect(onClaude.completionTokens).toBe(0);
    // Anything else leaves them alone.
    expect(withPanePatch(onGemini, { planMode: true })).toMatchObject({
      contextWindow: 1_048_576,
      promptTokens: 800_000,
    });
  });

  it("estimates the whole outgoing request", () => {
    expect(
      estimateMessages([
        { role: "system", content: "a".repeat(40) },
        { role: "user", content: "b".repeat(39) },
      ]),
    ).toBe(20);
  });

  it("compacts when the request or the last turn is past the threshold", () => {
    const full = { promptTokens: 150_000, completionTokens: 10_000 };
    expect(shouldCompact(makePane({ ...full, messages: messages(6) }), 100, 200_000)).toBe(true);
    // The last turn's counts alone need older messages to summarise.
    expect(shouldCompact(makePane({ ...full, messages: messages(4) }), 100, 200_000)).toBe(false);
    expect(
      shouldCompact(makePane({ promptTokens: 1_000, messages: messages(6) }), 100, 200_000),
    ).toBe(false);
    // A switched pane has no counts yet; what is about to go out decides.
    expect(shouldCompact(makePane({ messages: messages(2) }), 170_000, 200_000)).toBe(true);
    expect(shouldCompact(makePane({ messages: messages(6) }), 3_500, 4_096)).toBe(true);
  });
});

const long = (count: number, chars: number): PaneMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `${index}:`.padEnd(chars, "x"),
  }));

// Stands in for the model: records each prompt and answers with a short summary.
function fakeSummarizer(window: number) {
  const prompts: string[] = [];
  return {
    prompts,
    summarize: async (prompt: string) => {
      if (estimateTokens(prompt) > window) throw new Error("prompt overflowed the window");
      prompts.push(prompt);
      return `summary ${prompts.length}`;
    },
  };
}

describe("fitting history", () => {
  const ids = () => {
    let next = 0;
    return () => `s${next++}`;
  };

  it("keeps a summary plus the most recent messages", async () => {
    const model = fakeSummarizer(200_000);
    const fit = await fitHistory(messages(7), 150_000, 200_000, model.summarize, ids());
    expect(fit.messages.map((message) => message.id)).toEqual(["s0", "m3", "m4", "m5", "m6"]);
    expect(fit.messages[0]).toEqual({ id: "s0", role: "system", content: "summary 1" });
    expect(fit).toMatchObject({ summarized: 3, kept: 4, truncated: false, requests: 1 });
  });

  it("summarises a history far bigger than the window in chunks, then merges them", async () => {
    // 40 messages of ~10k tokens: ~400k tokens for a 32k window.
    const history = long(40, 40_000);
    const model = fakeSummarizer(32_768);
    const fit = await fitHistory(history, 26_000, 32_768, model.summarize, ids());
    // Each chunk holds one message (the limit is half the window): 39 of them, then one merge.
    expect(fit.requests).toBe(40);
    expect(model.prompts.at(-1)).toContain("[Earlier summary]: summary");
    // The newest messages don't all fit either, so only as many as fit are kept.
    expect(fit.kept).toBe(1);
    expect(fit.summarized).toBe(39);
    expect(fit.messages.at(-1)?.id).toBe("m39");
    expect(estimateMessages(fit.messages)).toBeLessThanOrEqual(26_000);
    expect(fit.tokensSent).toBeGreaterThan(estimateMessages(history.slice(0, 39)) / 2);
  });

  it("merges long summaries over several rounds, every request within the window", async () => {
    const model = fakeSummarizer(8_192);
    const verbose = async (prompt: string) => {
      await model.summarize(prompt);
      return "z".repeat(40_000);
    };
    const fit = await fitHistory(long(20, 12_000), 6_000, 8_192, verbose, ids());
    // 19 chunk summaries, then merges of two at a time: 10, 5, 3, 2 and 1.
    expect(fit.requests).toBe(19 + 10 + 5 + 3 + 2 + 1);
    expect(estimateMessages(fit.messages)).toBeLessThanOrEqual(6_000);
  });

  it("cuts the middle out of a single message too long for the room", async () => {
    const history = long(1, 100_000);
    const fit = await fitHistory(history, 4_000, 8_192, fakeSummarizer(8_192).summarize, ids());
    expect(fit).toMatchObject({ summarized: 0, kept: 1, truncated: true, requests: 0 });
    const content = fit.messages[0]?.content ?? "";
    expect(content.startsWith("0:x")).toBe(true);
    expect(content).toContain("the middle of this message was left out");
    expect(estimateTokens(content)).toBeLessThanOrEqual(3_000);
  });

  it("cuts down a huge old message so its summary request still fits", async () => {
    const history = [...long(1, 200_000), ...messages(4)];
    const model = fakeSummarizer(8_192);
    const fit = await fitHistory(history, 6_000, 8_192, model.summarize, ids());
    expect(fit).toMatchObject({ summarized: 1, kept: 4, requests: 1 });
    expect(model.prompts[0]).toContain("the middle of this message was left out");
  });

  it("fails on an empty summary rather than dropping the history", async () => {
    await expect(fitHistory(messages(7), 1_000, 8_192, async () => "  ", ids())).rejects.toThrow(
      "empty summary",
    );
  });

  it("chunks without splitting messages, each chunk within the limit", () => {
    const chunks = chunkMessages(long(10, 4_000), 2_500);
    expect(chunks).toHaveLength(5);
    expect(chunks.flat()).toHaveLength(10);
    expect(truncateMiddle("short", 10)).toBe("short");
  });

  it("tells the person what was summarised and what it cost", () => {
    const fit = { messages: [], summarized: 36, kept: 4, truncated: false, requests: 5 };
    expect(fitNotice({ ...fit, tokensSent: 610_000 }, 640_000, 200_000, "Claude Code")).toBe(
      "This conversation (~640k tokens) is too long for Claude Code's 200k window. Zenith summarised the earlier part (36 messages) to fit, which took 5 requests to Claude Code (~610k tokens); the last 4 messages are kept word for word.",
    );
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
