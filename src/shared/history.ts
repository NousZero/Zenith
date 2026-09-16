import type { HistoryExcerpt } from "./types";

// Private-use characters that mark search hits inside snippets; they never occur in normal text.
export const HIT_START = "";
export const HIT_END = "";

const STOPWORDS = new Set(
  "a an and are as at be but by can did do does for from had has have how i if in is it its me my of on or our so than that the their them then there these they this to was we were what when where which who why will with you your".split(
    " ",
  ),
);

// Turns free text into an FTS5 query. Every word is quoted, so input can never be FTS syntax.
// "all" requires every word (search box); "any" ranks messages matching any word (questions).
export function toFtsQuery(text: string, mode: "all" | "any"): string | undefined {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
    .filter((word) => mode === "all" || (word.length > 1 && !STOPWORDS.has(word)))
    .slice(0, 16);
  const unique = [...new Set(words)];
  if (unique.length === 0) return undefined;
  return unique.map((word) => `"${word}"*`).join(mode === "all" ? " " : " OR ");
}

export function splitHits(snippet: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  let rest = snippet;
  while (rest.length > 0) {
    const start = rest.indexOf(HIT_START);
    if (start === -1) {
      parts.push({ text: rest, hit: false });
      break;
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), hit: false });
    const end = rest.indexOf(HIT_END, start);
    const stop = end === -1 ? rest.length : end;
    parts.push({ text: rest.slice(start + 1, stop), hit: true });
    rest = rest.slice(stop + 1);
  }
  return parts.filter((part) => part.text.length > 0);
}

export function buildAskPrompt(question: string, excerpts: readonly HistoryExcerpt[]): string {
  const context = excerpts
    .map(
      (excerpt) =>
        `<excerpt session="${excerpt.sessionName}" pane="${excerpt.paneName}" role="${excerpt.role}">\n${excerpt.content}\n</excerpt>`,
    )
    .join("\n\n");
  return [
    "Answer the question using only these excerpts from my past conversations in Zenith.",
    context.length > 0
      ? `<excerpts>\n${context}\n</excerpts>`
      : "<excerpts>\n(no matching messages)\n</excerpts>",
    `Question: ${question}`,
    "Name the sessions your answer comes from. If the excerpts do not answer the question, say that plainly instead of guessing.",
  ].join("\n\n");
}
