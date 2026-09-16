import { describe, expect, it } from "vitest";

import { unifiedDiff } from "../../src/shared/diff";

describe("unifiedDiff", () => {
  it("returns an empty string when nothing changed", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n", "f.txt")).toBe("");
  });

  it("shows an appended line with context", () => {
    expect(unifiedDiff("alpha\n", "alpha\nbeta\n", "notes.txt")).toBe(
      ["--- notes.txt", "+++ notes.txt", "@@ -1,1 +1,2 @@", " alpha", "+beta"].join("\n"),
    );
  });

  it("treats a new file as all additions", () => {
    expect(unifiedDiff("", "one\ntwo", "new.txt")).toBe(
      ["--- new.txt", "+++ new.txt", "@@ -1,0 +1,2 @@", "+one", "+two"].join("\n"),
    );
  });

  it("splits distant changes into separate hunks with three lines of context", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const after = before.replace("line 2\n", "line two\n").replace("line 19", "line nineteen");
    const diff = unifiedDiff(before, after, "f");
    expect(diff.split("\n").filter((line) => line.startsWith("@@"))).toEqual([
      "@@ -1,5 +1,5 @@",
      "@@ -16,5 +16,5 @@",
    ]);
    expect(diff).toContain("-line 2\n+line two");
    expect(diff).toContain("-line 19\n+line nineteen");
  });
});
