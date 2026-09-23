// `@path` mentions in the composer. Agents that work in the project folder (Claude Code, Gemini,
// Copilot, Zenith's own) read the named file themselves, so the mention stays plain text.

// The query being typed after a trailing `@`, or undefined when the prompt does not end in one.
// ponytail: only a mention at the end of the prompt completes; mid-text caret positions do not.
export function mentionQuery(prompt: string): string | undefined {
  return /(?:^|\s)@([^\s@]*)$/.exec(prompt)?.[1];
}

// Files matching the query, best first: file name starts with it, then contains it, then the
// path contains it, then the letters appear in order.
export function rankFiles(files: readonly string[], query: string, limit: number): string[] {
  const needle = query.toLowerCase();
  const score = (path: string): number => {
    const lower = path.toLowerCase();
    const name = lower.slice(lower.lastIndexOf("/") + 1);
    if (needle === "") return 3;
    if (name.startsWith(needle)) return 0;
    if (name.includes(needle)) return 1;
    if (lower.includes(needle)) return 2;
    let at = 0;
    for (const char of lower) if (char === needle[at]) at += 1;
    return at === needle.length ? 3 : -1;
  };
  return files
    .map((path) => ({ path, rank: score(path) }))
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.path.length - b.path.length)
    .slice(0, limit)
    .map((item) => item.path);
}

// Replaces the trailing `@query` with the chosen path.
export function insertMention(prompt: string, path: string): string {
  return prompt.replace(/@([^\s@]*)$/, `@${path} `);
}
