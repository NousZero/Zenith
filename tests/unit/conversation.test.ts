import { describe, expect, it } from "vitest";

import {
  branchMessages,
  type LastTurn,
  resumeFrom,
  retryTarget,
  titleFromPrompt,
  undoLastExchange,
} from "../../src/shared/conversation";
import type { PaneMessage } from "../../src/shared/types";

const messages: PaneMessage[] = [
  { id: "u1", role: "user", content: "first" },
  { id: "a1", role: "assistant", content: "one" },
  { id: "u2", role: "user", content: "second" },
  { id: "a2", role: "assistant", content: "two" },
];

describe("conversation helpers", () => {
  it("retries the last user prompt with the history before it", () => {
    expect(retryTarget(messages)).toEqual({ history: messages.slice(0, 2), prompt: "second" });
    expect(retryTarget([])).toBeUndefined();
  });

  it("undo removes the last prompt and its reply", () => {
    expect(undoLastExchange(messages)).toEqual(messages.slice(0, 2));
    expect(undoLastExchange(messages.slice(0, 3))).toEqual(messages.slice(0, 2));
    expect(undoLastExchange([])).toEqual([]);
  });

  it("branch copies up to the chosen message with fresh ids", () => {
    let next = 0;
    const branched = branchMessages(messages, "a1", () => `n${++next}`);
    expect(branched).toEqual([
      { id: "n1", role: "user", content: "first" },
      { id: "n2", role: "assistant", content: "one" },
    ]);
  });

  it("titles a session from its first prompt line", () => {
    expect(titleFromPrompt("  Explain   WAL mode\nmore detail")).toBe("Explain WAL mode");
    expect(titleFromPrompt("")).toBe("New session");
    const long = titleFromPrompt(
      "Compare the tradeoffs between SQLite WAL mode and rollback journal for desktop apps",
    );
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(49);
  });
});

describe("resumeFrom", () => {
  const pane = { providerId: "claude-code", modelId: "default", projectPath: "/p" };
  const last: LastTurn = {
    requestId: "u2",
    ...pane,
    messageCount: messages.length,
    lastMessageId: "a2",
  };

  it("continues the last turn when the pane is exactly as that turn left it", () => {
    expect(resumeFrom(last, pane, messages)).toBe("u2");
  });

  it("starts over after undo, retry, or restore, which shorten the history", () => {
    expect(resumeFrom(last, pane, undoLastExchange(messages))).toBeUndefined();
    expect(resumeFrom(last, pane, retryTarget(messages)?.history ?? [])).toBeUndefined();
    expect(resumeFrom(last, pane, [])).toBeUndefined();
  });

  it("starts over when the last message is a different one, as after a compaction", () => {
    const swapped = [
      ...messages.slice(0, -1),
      { id: "other", role: "assistant" as const, content: "" },
    ];
    expect(resumeFrom(last, pane, swapped)).toBeUndefined();
  });

  it("starts over after a switch of provider, model, or folder, or with no turn kept", () => {
    expect(resumeFrom(last, { ...pane, providerId: "gemini-cli" }, messages)).toBeUndefined();
    expect(resumeFrom(last, { ...pane, modelId: "opus" }, messages)).toBeUndefined();
    expect(resumeFrom(last, { ...pane, projectPath: null }, messages)).toBeUndefined();
    expect(resumeFrom(undefined, pane, messages)).toBeUndefined();
  });
});
