import { describe, expect, it } from "vitest";

import { insertMention, mentionQuery, rankFiles } from "../../src/shared/mentions";

describe("composer mentions", () => {
  it("reads the query after a trailing @ only", () => {
    expect(mentionQuery("fix @src/ma")).toBe("src/ma");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("mail me@example.com")).toBeUndefined();
    expect(mentionQuery("fix @a.ts please")).toBeUndefined();
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

  it("replaces the typed query with the chosen path", () => {
    expect(insertMention("look at @ip", "src/main/ipc.ts")).toBe("look at @src/main/ipc.ts ");
  });
});
