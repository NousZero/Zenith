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

// Ready-made rule sets, so choosing how much an agent may do is one decision instead of a
// hand-written list. Each one is the whole file: picking a posture replaces the rules.
export interface Posture {
  id: "locked" | "standard" | "open";
  label: string;
  summary: string;
  rules: string;
}

const NEVER = ["deny Read *.env", "deny Read *.pem", "deny Read *id_rsa*", "deny Bash sudo*"];

export const POSTURES: readonly Posture[] = [
  {
    id: "locked",
    label: "Locked down",
    summary: "Reads freely, asks before every change and every command.",
    rules: [...NEVER, "ask Edit *", "ask Write *", "ask Bash *"].join("\n"),
  },
  {
    id: "standard",
    label: "Standard",
    summary: "Runs the project's own checks without asking; changes and other commands ask.",
    rules: [
      ...NEVER,
      "allow Bash git status*",
      "allow Bash git diff*",
      "allow Bash git log*",
      "allow Bash npm test*",
      "allow Bash npm run lint*",
      "allow Bash npm run typecheck*",
      "allow Bash pytest*",
      "allow Bash cargo test*",
      "allow Bash go test*",
      "ask Bash git push*",
      "ask Bash git reset*",
      "deny Bash rm -rf *",
    ].join("\n"),
  },
  {
    id: "open",
    label: "Open",
    summary: "Edits and runs commands without asking. Only the dangerous few still stop.",
    rules: [
      ...NEVER,
      "allow Edit *",
      "allow Write *",
      "allow Bash *",
      "ask Bash git push*",
      "deny Bash rm -rf *",
      "deny Bash git reset --hard*",
    ].join("\n"),
  },
];

// Which posture a rules text is, or undefined when it has been edited by hand. Compared line by
// line so spacing and comments don't matter.
export function postureOf(text: string): Posture | undefined {
  const lines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
      .join("\n");
  const current = lines(text);
  return POSTURES.find((posture) => lines(posture.rules) === current);
}

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
