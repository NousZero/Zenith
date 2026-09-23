// `@path` mentions in the composer. Agents that work in the project folder (Claude Code, Gemini,
// Copilot, Zenith's own) read the named file themselves, so the mention stays plain text.

// The query in the `@query` run ending at the caret, or undefined when the caret isn't inside
// one. Requires a preceding start-of-string or whitespace, so `me@example.com` never matches.
export function mentionQuery(prompt: string, caret: number): string | undefined {
  return /(?:^|\s)@([^\s@]*)$/.exec(prompt.slice(0, caret))?.[1];
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

// Replaces the `@query` run ending at the caret with the chosen path, leaving the rest of the
// prompt untouched. Returns the new text and the caret position just after the inserted mention.
export function insertMention(
  prompt: string,
  caret: number,
  path: string,
): { prompt: string; caret: number } {
  const before = prompt.slice(0, caret).replace(/@([^\s@]*)$/, `@${path} `);
  return { prompt: before + prompt.slice(caret), caret: before.length };
}
