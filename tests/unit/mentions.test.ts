import { describe, expect, it } from "vitest";

import { insertMention, mentionQuery, rankFiles } from "../../src/shared/mentions";

describe("composer mentions", () => {
  it("reads the query in the @ run ending at the caret", () => {
    expect(mentionQuery("fix @src/ma", 11)).toBe("src/ma");
    expect(mentionQuery("@", 1)).toBe("");
    expect(mentionQuery("mail me@example.com", 20)).toBeUndefined();
    expect(mentionQuery("mail me@example.com", 8)).toBeUndefined();
    expect(mentionQuery("fix @a.ts please", 17)).toBeUndefined();
    // Caret in the middle of the prompt: the query is what's typed so far, not the whole word.
    expect(mentionQuery("fix @src/ma please", 11)).toBe("src/ma");
  });

  it("ranks file-name matches before path and letter matches", () => {
    const files = ["docs/ipc-notes.md", "src/main/ipc.ts", "src/renderer/App.tsx", "src/ipc/x.ts"];
    expect(rankFiles(files, "ipc", 10)).toEqual([
      "src/main/ipc.ts",
      "docs/ipc-notes.md",
      "src/ipc/x.ts",
    ]);
    expect(rankFiles(files, "sapp", 10)).toEqual(["src/renderer/App.tsx"]);
    expect(rankFiles(files, "zzz", 10)).toEqual([]);
  });

  it("replaces the typed query with the chosen path, and reports the new caret", () => {
    expect(insertMention("look at @ip", 11, "src/main/ipc.ts")).toEqual({
      prompt: "look at @src/main/ipc.ts ",
      caret: 25,
    });
    // Caret mid-prompt: only the query before it is replaced, the rest of the text stays put.
    expect(insertMention("look at @ip please", 11, "src/main/ipc.ts")).toEqual({
      prompt: "look at @src/main/ipc.ts  please",
      caret: 25,
    });
  });
});
