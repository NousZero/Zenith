import type { ChatMessage, PaneMessage, PaneState } from "./types";

// Compaction starts when the last turn filled this share of the model's context window.
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

export function contextLimit(pane: Pick<PaneState, "providerId" | "modelId" | "contextWindow">) {
  if (pane.contextWindow) return pane.contextWindow;
  if (LOCAL_PROVIDERS.has(pane.providerId)) return undefined;
  const match = KNOWN_WINDOWS.find(([pattern]) => pattern.test(pane.modelId));
  return match?.[1] ?? PROVIDER_DEFAULT_WINDOWS[pane.providerId];
}

// Each turn resends the whole conversation, so the last turn's tokens approximate the context in use.
export function contextUsed(pane: Pick<PaneState, "promptTokens" | "completionTokens">): number {
  return pane.promptTokens + pane.completionTokens;
}

export function shouldCompact(pane: PaneState): boolean {
  const limit = contextLimit(pane);
  return (
    limit !== undefined &&
    pane.messages.length > COMPACT_KEEP_MESSAGES &&
    contextUsed(pane) >= limit * COMPACT_THRESHOLD
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

export function compactMessages(
  messages: readonly PaneMessage[],
  summary: string,
  newId: () => string,
): PaneMessage[] {
  return [
    { id: newId(), role: "system", content: summary.trim() },
    ...messages.slice(-COMPACT_KEEP_MESSAGES),
  ];
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
