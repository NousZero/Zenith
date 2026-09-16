import { describe, expect, it } from "vitest";

import { parseBotCommand, splitMessage } from "../../src/shared/bots";

describe("splitMessage", () => {
  it("keeps short replies whole", () => {
    expect(splitMessage("  hello  ", 10)).toEqual(["hello"]);
    expect(splitMessage("", 10)).toEqual([]);
  });

  it("breaks at paragraphs, then lines, then words, then hard", () => {
    expect(splitMessage("aaaa bbbb\n\ncccc", 12)).toEqual(["aaaa bbbb", "cccc"]);
    expect(splitMessage("aaaa bbbb cccc", 10)).toEqual(["aaaa bbbb", "cccc"]);
    expect(splitMessage("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});

describe("parseBotCommand", () => {
  it("recognizes pairing, reset, and help commands", () => {
    expect(parseBotCommand("/pair 123456")).toEqual({ kind: "pair", code: "123456" });
    expect(parseBotCommand("/pair@ZenithBot 42")).toEqual({ kind: "pair", code: "42" });
    expect(parseBotCommand("/RESET")).toEqual({ kind: "reset" });
    expect(parseBotCommand("/start")).toEqual({ kind: "help" });
    expect(parseBotCommand("what is /pair")).toBeUndefined();
  });
});
