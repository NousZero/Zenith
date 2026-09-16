// Per-tool permission rules for agents, one per line: "<allow|ask|deny> <tool> [pattern]".
// "*" in the tool or pattern matches any text. The last matching rule wins; with no match
// the agent's normal behavior applies (reading inside the project is free, the rest asks).

export type PermissionAction = "allow" | "ask" | "deny";

export interface PermissionRule {
  action: PermissionAction;
  tool: string;
  pattern: string;
}

export const PERMISSION_RULES_EXAMPLE = `# allow Bash npm test*
# deny Read *.env
# ask Edit src/*`;

// Returns the rules in a text, or throws a message naming the first bad line.
export function parsePermissionRules(text: string): PermissionRule[] {
  const rules: PermissionRule[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const match = /^(allow|ask|deny)\s+(\S+)(?:\s+(.+))?$/.exec(line);
    if (!match) {
      throw new Error(
        `Line ${index + 1} should look like "allow Bash npm test*": allow, ask, or deny, then a tool name, then an optional pattern.`,
      );
    }
    rules.push({
      action: match[1] as PermissionAction,
      tool: match[2] ?? "*",
      pattern: match[3]?.trim() ?? "*",
    });
  });
  return rules;
}

export function wildcardMatch(pattern: string, value: string): boolean {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "s").test(value);
}

// Characters that chain or redirect shell commands; an allow rule never matches such a command,
// so "allow Bash npm test*" can't approve "npm test && rm -rf ~".
const SHELL_CONTROL = /[;&|`$<>(){}\n\r]/;

export function decidePermission(
  rules: readonly PermissionRule[],
  tool: string,
  subject: string,
): PermissionAction | undefined {
  let decision: PermissionAction | undefined;
  for (const rule of rules) {
    if (!wildcardMatch(rule.tool, tool) || !wildcardMatch(rule.pattern, subject)) continue;
    if (rule.action === "allow" && tool === "Bash" && SHELL_CONTROL.test(subject)) continue;
    decision = rule.action;
  }
  return decision;
}
