// ponytail: chars/4 heuristic, not a real tokenizer. Upgrade to a
// per-provider tokenizer if users need exact counts.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
