import type { LucideIcon } from "lucide-react";

export interface Command {
  // Typed after "/" in the composer.
  name: string;
  title: string;
  icon: LucideIcon;
  // Placeholder for the text after the command name; absent when it takes none.
  argument?: string;
  run(argument: string): void;
}

// Zenith's own commands; library skills and commands with these names are hidden, not shadowing them.
export const BUILTIN_COMMAND_NAMES: ReadonlySet<string> = new Set([
  "new",
  "add",
  "retry",
  "undo",
  "stop",
  "clear",
  "synthesize",
  "compact",
  "search",
  "ask",
  "insights",
  "title",
  "personality",
  "bots",
  "settings",
  "help",
  "library",
  "schedule",
  "usage",
  "cost",
  "model",
  "doctor",
  "context",
  "export",
]);

export function parseSlashCommand(text: string): { name: string; argument: string } | undefined {
  const match = /^\/(\S*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return undefined;
  return { name: (match[1] ?? "").toLowerCase(), argument: (match[2] ?? "").trim() };
}

export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  const prefix = commands.filter((command) => command.name.startsWith(needle));
  const other = commands.filter(
    (command) =>
      !prefix.includes(command) &&
      (command.name.includes(needle) || command.title.toLowerCase().includes(needle)),
  );
  return [...prefix, ...other];
}

// The composer only completes names, so "/ti" never selects a command whose title merely contains "ti".
export function completeCommandName(commands: readonly Command[], partial: string): Command[] {
  return commands.filter((command) => command.name.startsWith(partial));
}
