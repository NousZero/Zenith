// How long an agent may say nothing before its latest warning is shown.
export const STALL_NOTICE_MS = 15_000;

// Words in an agent's log line that explain a stall worth showing the user.
const STALL_SIGNAL =
  /\b(?:warn(?:ing)?|error|retry(?:ing)?|quota|rate.?limit|429|unauthori[sz]ed|forbidden|timed? ?out|exhausted)\b/i;

// The latest stderr line that explains a stall, without its timestamp, level, or logger prefix,
// or undefined when the agent has said nothing worth showing.
export function stallNotice(stderr: string): string | undefined {
  const line = stderr
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => STALL_SIGNAL.test(entry))
    .at(-1);
  if (!line) return undefined;
  const cleaned = line
    .replace(/^\d{4}-\d{2}-\d{2}[ T][\d:.,]+(?:Z|[+-]\d{2}:?\d{2})?\s*/, "")
    .replace(/^\[(?:DEBUG|INFO|WARN(?:ING)?|ERROR|CRITICAL)\]\s*/i, "")
    .replace(/^[\w.-]+:\s+/, "")
    .replace(/^[⚠!]\s*/, "")
    .trim();
  return cleaned.length > 200 ? `${cleaned.slice(0, 199)}…` : cleaned || undefined;
}

// Passes an agent's output through unchanged. An agent waiting on its own model provider (a
// quota retry, say) prints nothing, so after each quiet spell its latest warning is slipped in
// between items, once per distinct warning, so the user sees why the reply has stopped.
export async function* withStallNotices<T>(
  source: AsyncIterable<T>,
  notice: () => string | undefined,
  quietMs = STALL_NOTICE_MS,
): AsyncGenerator<T | { notice: string }> {
  const iterator = source[Symbol.asyncIterator]();
  let shown: string | undefined;
  try {
    for (;;) {
      // The same pending read is raced again after each quiet spell, so no item is lost.
      const next = iterator.next();
      let result: IteratorResult<T> | undefined;
      while (!result) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        result = await Promise.race([
          next,
          new Promise<undefined>(
            (resolve) => (timer = setTimeout(() => resolve(undefined), quietMs)),
          ),
        ]);
        clearTimeout(timer);
        const text = result ? undefined : notice();
        if (text && text !== shown) {
          shown = text;
          yield { notice: text };
        }
      }
      if (result.done) return;
      yield result.value;
    }
  } finally {
    // Not awaited: a source still waiting for its next item would otherwise hold the caller here
    // until the agent spoke again.
    void iterator.return?.().catch(() => undefined);
  }
}
