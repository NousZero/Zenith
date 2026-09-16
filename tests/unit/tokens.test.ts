import { describe, expect, it } from "vitest";

import { estimateTokens } from "../../src/shared/tokens";

describe("estimateTokens", () => {
  it("estimates roughly one token per four characters, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });
});
