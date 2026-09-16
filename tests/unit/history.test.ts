import { describe, expect, it } from "vitest";

import {
  buildAskPrompt,
  HIT_END,
  HIT_START,
  splitHits,
  toFtsQuery,
} from "../../src/shared/history";

describe("toFtsQuery", () => {
  it("quotes every word so input cannot inject FTS syntax", () => {
    expect(toFtsQuery('WAL mode" OR x', "all")).toBe('"wal"* "mode"* "or"* "x"*');
    expect(toFtsQuery("  ", "all")).toBeUndefined();
  });

  it("drops stopwords and joins with OR for questions", () => {
    expect(toFtsQuery("What is the name of my dog?", "any")).toBe('"name"* OR "dog"*');
    expect(toFtsQuery("what is it", "any")).toBeUndefined();
  });
});

describe("splitHits", () => {
  it("separates highlighted words from plain text", () => {
    expect(splitHits(`a ${HIT_START}dog${HIT_END} barks`)).toEqual([
      { text: "a ", hit: false },
      { text: "dog", hit: true },
      { text: " barks", hit: false },
    ]);
  });
});

describe("buildAskPrompt", () => {
  it("includes excerpts with their sessions and asks for an honest answer", () => {
    const prompt = buildAskPrompt("dog name?", [
      { sessionName: "Pets", paneName: "Pane A", role: "user", content: "My dog is Biscuit." },
    ]);
    expect(prompt).toContain(
      '<excerpt session="Pets" pane="Pane A" role="user">\nMy dog is Biscuit.\n</excerpt>',
    );
    expect(prompt).toContain("Question: dog name?");
    expect(buildAskPrompt("x", [])).toContain("(no matching messages)");
  });
});
