import type { PaneMessage } from "./types";

// The last user prompt and the history before it, so it can be sent again.
export function retryTarget(
  messages: readonly PaneMessage[],
): { history: PaneMessage[]; prompt: string } | undefined {
  const index = messages.findLastIndex((message) => message.role === "user");
  const prompt = messages[index];
  if (!prompt) return undefined;
  return { history: messages.slice(0, index), prompt: prompt.content };
}

// Removes the last user prompt and everything after it.
export function undoLastExchange(messages: readonly PaneMessage[]): PaneMessage[] {
  const index = messages.findLastIndex((message) => message.role === "user");
  return index === -1 ? [...messages] : messages.slice(0, index);
}

// Copies the conversation up to and including messageId, with fresh ids.
export function branchMessages(
  messages: readonly PaneMessage[],
  messageId: string,
  newId: () => string,
): PaneMessage[] {
  const index = messages.findIndex((message) => message.id === messageId);
  return messages.slice(0, index + 1).map((message) => ({ ...message, id: newId() }));
}

const TITLE_MAX_LENGTH = 48;

// ponytail: first-prompt heuristic; ask a model for a summary title if these read poorly.
export function titleFromPrompt(prompt: string): string {
  const line = prompt.trim().split("\n")[0]?.replace(/\s+/g, " ") ?? "";
  if (line.length <= TITLE_MAX_LENGTH) return line || "New session";
  const cut = line.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 20 ? cut.slice(0, lastSpace) : cut}…`;
}
