import { estimateTokens } from "./tokens";
import type { ChatMessage, PaneMessage, PaneState } from "./types";

// Compaction starts when the request about to go out, or the last turn, fills this share of the
// model's context window; the rest is room for the reply and what the tool adds itself.
export const COMPACT_THRESHOLD = 0.8;
// The most recent messages stay verbatim after compaction.
export const COMPACT_KEEP_MESSAGES = 4;

const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio"]);

// ponytail: pattern table for tools that do not report a window; fetch models.dev limits if it drifts.
const KNOWN_WINDOWS: readonly [RegExp, number][] = [
  [/gemini/i, 1_048_576],
  [/claude|sonnet|opus|haiku/i, 200_000],
  [/gpt-4\.1/i, 1_047_576],
  [/gpt-4o|o\d-mini|\bo\d\b/i, 128_000],
];

const PROVIDER_DEFAULT_WINDOWS: Record<string, number> = {
  "claude-code": 200_000,
  "gemini-cli": 1_048_576,
};

// ponytail: guesses for windows nothing reports. A local server that can't say uses its usual
// default load size; anything else a size most current remote models exceed.
const LOCAL_DEFAULT_WINDOW = 4_096;
const UNKNOWN_WINDOW = 128_000;

// contextWindow is only ever the window of the pane's current model: withPanePatch clears it when
// the provider or model changes.
export function contextLimit(
  pane: Pick<PaneState, "providerId" | "modelId" | "contextWindow">,
): number {
  if (pane.contextWindow) return pane.contextWindow;
  if (LOCAL_PROVIDERS.has(pane.providerId)) return LOCAL_DEFAULT_WINDOW;
  const match = KNOWN_WINDOWS.find(([pattern]) => pattern.test(pane.modelId));
  return match?.[1] ?? PROVIDER_DEFAULT_WINDOWS[pane.providerId] ?? UNKNOWN_WINDOW;
}

// What a list of messages costs to send, by the same estimate the pane shows.
export function estimateMessages(messages: readonly ChatMessage[]): number {
  return estimateTokens(messages.map((message) => message.content).join("\n"));
}

// The pane after a change. Moving to another assistant or model makes the reported window and
// token counts describe the wrong model, so they are replaced by what the history is estimated
// to cost; the next reply reports real ones.
export function withPanePatch(pane: PaneState, patch: Partial<PaneState>): PaneState {
  const next = { ...pane, ...patch };
  return next.providerId === pane.providerId && next.modelId === pane.modelId
    ? next
    : {
        ...next,
        contextWindow: null,
        promptTokens: estimateMessages(next.messages),
        completionTokens: 0,
      };
}

// Each turn resends the whole conversation, so the last turn's tokens approximate the context in use.
export function contextUsed(pane: Pick<PaneState, "promptTokens" | "completionTokens">): number {
  return pane.promptTokens + pane.completionTokens;
}

// Whether history must be shortened before it goes out: the request about to be sent is over the
// threshold, or the last turn was and there are older messages to summarise. estimate is what the
// request is expected to cost; the last turn's counts are from this model, see withPanePatch.
export function shouldCompact(pane: PaneState, estimate: number, limit: number): boolean {
  const budget = limit * COMPACT_THRESHOLD;
  return (
    estimate > budget ||
    (pane.messages.length > COMPACT_KEEP_MESSAGES && contextUsed(pane) >= budget)
  );
}

function transcript(messages: readonly ChatMessage[]): string {
  return messages
    .map((message) =>
      message.role === "system"
        ? `[Earlier summary]: ${message.content}`
        : `[${message.role === "user" ? "User" : "Assistant"}]: ${message.content}`,
    )
    .join("\n\n");
}

// Adapted from OpenCode's session compaction prompt (MIT, anomalyco/opencode).
export function buildCompactionPrompt(messages: readonly ChatMessage[]): string {
  return [
    `Here is the conversation so far:\n\n<conversation>\n${transcript(messages)}\n</conversation>`,
    "Summarize this conversation so it can be continued without the original messages.",
    "Keep: the user's goals and constraints, decisions made, important facts, code or names that were agreed on, and open questions.",
    "Write concise bullet points under the headings Goals, Decisions, Facts, and Open questions. Reply with the summary only.",
  ].join("\n\n");
}

// A summary request gets at most this share of the summarising model's window, leaving the rest
// for the instructions and the summary it writes back.
const CHUNK_SHARE = 0.5;
// Of the room history may take, the newest messages kept word for word get at most this share;
// the rest holds the summary.
const KEEP_SHARE = 0.75;
// The label and line breaks each message adds to a transcript.
const MESSAGE_OVERHEAD = 4;
const CUT_MARKER =
  "\n\n[… the middle of this message was left out to fit the context window …]\n\n";

function messageTokens(message: ChatMessage): number {
  return estimateTokens(message.content) + MESSAGE_OVERHEAD;
}

// Keeps the start and end of a text too long for maxTokens, with a marker where the middle was.
export function truncateMiddle(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const keep = Math.max(0, maxTokens * 4 - CUT_MARKER.length);
  const head = Math.ceil(keep / 2);
  return `${text.slice(0, head)}${CUT_MARKER}${text.slice(text.length - (keep - head))}`;
}

// Splits messages, oldest first, into runs whose transcript fits maxTokens each. A message too
// long for a run of its own is cut down in the middle.
export function chunkMessages(
  messages: readonly ChatMessage[],
  maxTokens: number,
): ChatMessage[][] {
  const chunks: ChatMessage[][] = [];
  let current: ChatMessage[] = [];
  let size = 0;
  for (const message of messages) {
    const fitted: ChatMessage = {
      role: message.role,
      content: truncateMiddle(message.content, maxTokens - MESSAGE_OVERHEAD),
    };
    const tokens = messageTokens(fitted);
    if (current.length > 0 && size + tokens > maxTokens) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(fitted);
    size += tokens;
  }
  return current.length > 0 ? [...chunks, current] : chunks;
}

export interface FitResult {
  messages: PaneMessage[];
  // Older messages replaced by the summary; zero when nothing was summarised.
  summarized: number;
  // Newest messages kept word for word, and whether the newest had to be cut down all the same.
  kept: number;
  truncated: boolean;
  // Summary requests made, and the tokens they sent, which is what fitting cost.
  requests: number;
  tokensSent: number;
}

// Shortens history to about room tokens: the newest messages (up to COMPACT_KEEP_MESSAGES) stay
// word for word, and everything older is summarised by the model in chunks that each fit well
// inside its window, then the summaries are merged the same way until one is left.
// ponytail: chunks are summarised one after another, which is slow for a huge history; send them
// in parallel if that matters more than the tool's rate limits.
export async function fitHistory(
  history: readonly PaneMessage[],
  room: number,
  window: number,
  summarize: (prompt: string) => Promise<string>,
  newId: () => string,
): Promise<FitResult> {
  const keepRoom = Math.floor(room * KEEP_SHARE);
  const kept: PaneMessage[] = [];
  let keptTokens = 0;
  let truncated = false;
  for (const message of history.toReversed()) {
    if (kept.length === COMPACT_KEEP_MESSAGES) break;
    if (keptTokens + messageTokens(message) <= keepRoom) {
      kept.unshift(message);
      keptTokens += messageTokens(message);
      continue;
    }
    // Even the newest message alone is too long, so keep its start and end.
    if (kept.length === 0) {
      const content = truncateMiddle(message.content, keepRoom - MESSAGE_OVERHEAD);
      kept.unshift({ ...message, content });
      keptTokens = estimateTokens(content) + MESSAGE_OVERHEAD;
      truncated = true;
    }
    break;
  }
  const older = history.slice(0, history.length - kept.length);
  const result = { kept: kept.length, truncated, requests: 0, tokensSent: 0 };
  if (older.length === 0) return { ...result, messages: kept, summarized: 0 };

  const chunkRoom = Math.floor(window * CHUNK_SHARE);
  // Two summaries always fit one merge request, so every round at least halves them.
  const summaryCap = Math.floor(chunkRoom / 2) - MESSAGE_OVERHEAD;
  let parts: ChatMessage[] = older.map(({ role, content }) => ({ role, content }));
  do {
    const summaries: ChatMessage[] = [];
    for (const chunk of chunkMessages(parts, chunkRoom)) {
      const prompt = buildCompactionPrompt(chunk);
      result.requests += 1;
      result.tokensSent += estimateTokens(prompt);
      const summary = (await summarize(prompt)).trim();
      if (summary === "") throw new Error("The model returned an empty summary.");
      summaries.push({ role: "system", content: truncateMiddle(summary, summaryCap) });
    }
    parts = summaries;
  } while (parts.length > 1);
  const summary = truncateMiddle(parts[0]?.content ?? "", room - keptTokens - MESSAGE_OVERHEAD);
  return {
    ...result,
    messages: [{ id: newId(), role: "system", content: summary }, ...kept],
    summarized: older.length,
  };
}

// Mixture of Agents, as in Hermes Agent's /moa command (MIT, Nous Research).
export function buildSynthesisPrompt(
  question: string,
  answers: readonly { source: string; content: string }[],
): string {
  const responses = answers
    .map(
      (answer, index) =>
        `<response ${index + 1} from="${answer.source}">\n${answer.content}\n</response>`,
    )
    .join("\n\n");
  return [
    `Question:\n<question>\n${question}\n</question>`,
    `${answers.length} AI models answered it:\n\n${responses}`,
    "Write the single best answer to the question. Combine the strongest points, correct mistakes, and resolve contradictions.",
    "If the responses disagree on something that matters, say so briefly and explain which view is better supported. Do not mention the response numbers.",
  ].join("\n\n");
}
