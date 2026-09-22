import { describe, expect, it } from "vitest";

import { denyOptionId, denyRuleFor } from "../../src/shared/deny-rule";
import type { PermissionRequest } from "../../src/shared/types";

import {
  decidePermission,
  parsePermissionRules,
  POSTURES,
  postureOf,
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

describe("postures", () => {
  it("parses, and each one decides what its summary promises", () => {
    const rules = Object.fromEntries(
      POSTURES.map((posture) => [posture.id, parsePermissionRules(posture.rules)]),
    );

    // Secrets are off limits whichever posture is chosen.
    for (const posture of POSTURES) {
      expect(decidePermission(rules[posture.id] ?? [], "Read", "config/.env")).toBe("deny");
    }

    expect(decidePermission(rules["locked"] ?? [], "Bash", "npm test")).toBe("ask");
    expect(decidePermission(rules["standard"] ?? [], "Bash", "npm test -- --silent")).toBe("allow");
    expect(decidePermission(rules["standard"] ?? [], "Edit", "src/a.ts")).toBeUndefined();
    expect(decidePermission(rules["standard"] ?? [], "Bash", "git push origin main")).toBe("ask");
    expect(decidePermission(rules["open"] ?? [], "Edit", "src/a.ts")).toBe("allow");
    expect(decidePermission(rules["open"] ?? [], "Bash", "rm -rf build")).toBe("deny");
  });

  it("recognises its own text, ignoring comments and spacing, and nothing else", () => {
    const standard = POSTURES.find((posture) => posture.id === "standard");
    expect(postureOf(`# mine\n\n${standard?.rules ?? ""}\n`)?.id).toBe("standard");
    expect(postureOf("allow Bash *")).toBeUndefined();
    expect(postureOf("")).toBeUndefined();
  });
});

describe("rules from denials", () => {
  const request = (tool: string, subject: string): PermissionRequest => ({
    permissionId: "p1",
    requestId: "r1",
    paneId: "pane-1",
    title: "Approve",
    tool,
    subject,
    options: [
      { id: "allow", label: "Allow", kind: "allow_once" },
      { id: "deny", label: "Deny", kind: "reject_once" },
    ],
  });

  it("covers a command by its first two words and a file by name", () => {
    expect(denyRuleFor(request("Bash", "git push --force origin main"))).toBe(
      "deny Bash git push*",
    );
    expect(denyRuleFor(request("Write", "src/index.ts"))).toBe("deny Write src/index.ts");
    expect(denyRuleFor({ ...request("Bash", ""), subject: "" })).toBeUndefined();
    const withoutTool: PermissionRequest = { ...request("Bash", "ls") };
    delete withoutTool.tool;
    expect(denyRuleFor(withoutTool)).toBeUndefined();
  });

  it("writes a rule that then denies the same command", () => {
    const rule = denyRuleFor(request("Bash", "git push --force origin main")) ?? "";
    const rules = parsePermissionRules(rule);
    expect(decidePermission(rules, "Bash", "git push --force origin main")).toBe("deny");
    expect(decidePermission(rules, "Bash", "git status")).toBeUndefined();
  });

  it("answers with the option that denies", () => {
    expect(denyOptionId(request("Bash", "ls"))).toBe("deny");
    expect(denyOptionId({ ...request("Bash", "ls"), options: [] })).toBeNull();
  });
});
