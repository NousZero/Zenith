import { describe, expect, it } from "vitest";

import { OLLAMA_MAX_CONTEXT, ollamaContextSize } from "../../../src/main/providers/local-server";

describe("ollamaContextSize", () => {
  it("starts at Ollama's default and doubles to fit the prompt and a reply", () => {
    expect(ollamaContextSize(100, 131_072)).toBe(4_096);
    expect(ollamaContextSize(3_000, 131_072)).toBe(8_192);
    expect(ollamaContextSize(20_000, 131_072)).toBe(32_768);
  });

  it("never goes past the model's window or the memory-friendly ceiling", () => {
    expect(ollamaContextSize(20_000, 8_192)).toBe(8_192);
    expect(ollamaContextSize(500_000, 1_048_576)).toBe(OLLAMA_MAX_CONTEXT);
    expect(ollamaContextSize(100, 2_048)).toBe(2_048);
  });

  it("assumes the default window when the model's is unknown", () => {
    expect(ollamaContextSize(20_000)).toBe(4_096);
  });
});
