export type LibraryKind = "skill" | "command" | "agent";

// Where an item was found. Only "zenith" items are editable in Zenith.
export type LibrarySource = "zenith" | "project" | "claude" | "opencode" | "hermes";

export interface LibraryItem {
  kind: LibraryKind;
  name: string;
  description: string;
  source: LibrarySource;
  path: string;
  readOnly: boolean;
  // Agents only: tool names the agent may use, when its file limits them.
  tools?: string[];
  argumentHint?: string;
}

export interface LibraryDocument {
  attributes: Record<string, string | string[]>;
  body: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return /^(["']).*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

// Reads the small YAML front matter subset these files use: `key: value`, `key: [a, b]`,
// `key:` followed by `- item` lines, and `key: |` or `key: >` followed by indented text (joined
// into one line). Anything fancier is kept as plain text.
export function parseFrontMatter(text: string): LibraryDocument {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { attributes: {}, body: text.trim() };
  const attributes: Record<string, string | string[]> = {};
  let listKey: string | undefined;
  let blockKey: string | undefined;
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    if (blockKey && /^\s+\S/.test(line)) {
      const current = attributes[blockKey];
      attributes[blockKey] = current ? `${String(current)} ${line.trim()}` : line.trim();
      continue;
    }
    blockKey = undefined;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const current = attributes[listKey];
      attributes[listKey] = [...(Array.isArray(current) ? current : []), unquote(item[1] ?? "")];
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1] ?? "";
    const value = (pair[2] ?? "").trim();
    listKey = value === "" ? key : undefined;
    if (value === "") continue;
    if (/^[|>][-+]?$/.test(value)) {
      blockKey = key;
      attributes[key] = "";
      continue;
    }
    attributes[key] =
      value.startsWith("[") && value.endsWith("]")
        ? value.slice(1, -1).split(",").map(unquote).filter(Boolean)
        : unquote(value);
  }
  return { attributes, body: (match[2] ?? "").trim() };
}

export function attributeText(document: LibraryDocument, key: string): string {
  const value = document.attributes[key];
  return Array.isArray(value) ? value.join(", ") : (value ?? "");
}

export function attributeList(document: LibraryDocument, key: string): string[] | undefined {
  const value = document.attributes[key];
  if (value === undefined) return undefined;
  const items = Array.isArray(value) ? value : value.split(",");
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function serializeDocument(attributes: Record<string, string>, body: string): string {
  const lines = Object.entries(attributes)
    .filter(([, value]) => value.trim() !== "")
    .map(
      ([key, value]) => `${key}: ${/[:#\n]|^\s|\s$/.test(value) ? JSON.stringify(value) : value}`,
    );
  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

// Fills a command template the way Claude Code and OpenCode do: $ARGUMENTS for everything,
// $1..$9 for words. A template without placeholders gets the arguments appended.
export function expandCommand(template: string, argumentsText: string): string {
  const args = argumentsText.trim();
  const words = args.split(/\s+/).filter(Boolean);
  if (!/\$ARGUMENTS|\$[1-9]/.test(template)) {
    return args ? `${template.trim()}\n\n${args}` : template.trim();
  }
  return template
    .replaceAll("$ARGUMENTS", args)
    .replace(/\$([1-9])/g, (_, index: string) => words[Number(index) - 1] ?? "")
    .trim();
}

export function buildSkillPrompt(
  skill: { name: string; path: string },
  body: string,
  task: string,
): string {
  const folder = skill.path.replace(/[\\/]SKILL\.md$/i, "");
  return [
    `Use the "${skill.name}" skill for this task. Follow its instructions.`,
    `<skill name="${skill.name}" folder="${folder}">\n${body}\n</skill>`,
    `Task: ${task.trim() || "Apply this skill to the current conversation."}`,
  ].join("\n\n");
}

export const PLAN_MODE_INSTRUCTIONS =
  "Plan mode: do not create, edit, or delete files and do not run commands that change anything. Read what you need, then reply with a clear step-by-step plan and the files it would touch. The user will approve the plan before anything is built.";

// Names usable after "/": letters, digits, "-", "_", ":" and "." (Claude Code allows namespaces).
export function isCommandName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(name);
}
