import { describe, expect, it } from "vitest";

import {
  assertSafeModelId,
  buildCliPrompt,
  withSystemPreamble,
} from "../../../src/main/cli/transcript";

describe("buildCliPrompt", () => {
  it("passes a single user message through unchanged", () => {
    expect(buildCliPrompt([{ role: "user", content: "hello" }])).toEqual({
      system: undefined,
      prompt: "hello",
    });
  });

  it("separates memory into the system text and serializes earlier turns", () => {
    const result = buildCliPrompt([
      { role: "system", content: "Be concise." },
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "follow-up" },
    ]);
    expect(result.system).toBe("Be concise.");
    expect(result.prompt).toContain("<user>\nfirst question\n</user>");
    expect(result.prompt).toContain("<assistant>\nfirst answer\n</assistant>");
    expect(result.prompt.endsWith("<user>\nfollow-up\n</user>")).toBe(true);
  });

  it("rejects a conversation that does not end with a user message", () => {
    expect(() =>
      buildCliPrompt([
        { role: "user", content: "q" },
        { role: "assistant", content: "a" },
      ]),
    ).toThrow("must end with a user message");
  });
});

describe("withSystemPreamble", () => {
  it("prepends instructions only when system text exists", () => {
    expect(withSystemPreamble({ system: undefined, prompt: "p" })).toBe("p");
    expect(withSystemPreamble({ system: "Be brief.", prompt: "p" })).toBe(
      "Follow these instructions:\nBe brief.\n\np",
    );
  });
});

describe("assertSafeModelId", () => {
  it("accepts real model ids", () => {
    for (const id of [
      "haiku",
      "gemini-3-pro-preview",
      "claude-opus-4.8-fast",
      "qwen2.5vl:7b",
      "meta/llama",
    ]) {
      expect(assertSafeModelId(id)).toBe(id);
    }
  });

  it("rejects values that could be read as command-line flags", () => {
    expect(() => assertSafeModelId("--yolo")).toThrow("Unsupported model id");
    expect(() => assertSafeModelId("-p")).toThrow("Unsupported model id");
    expect(() => assertSafeModelId("")).toThrow("Unsupported model id");
    expect(() => assertSafeModelId("a b")).toThrow("Unsupported model id");
  });
});
