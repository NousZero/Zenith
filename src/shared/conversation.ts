import type { PaneMessage, PaneState } from "./types";

// The last user prompt and the history before it, so it can be sent again.
export function retryTarget(
  messages: readonly PaneMessage[],
): { history: PaneMessage[]; prompt: string; images?: PaneMessage["images"] } | undefined {
  const index = messages.findLastIndex((message) => message.role === "user");
  const prompt = messages[index];
  if (!prompt) return undefined;
  return {
    history: messages.slice(0, index),
    prompt: prompt.content,
    ...(prompt.images ? { images: prompt.images } : {}),
  };
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

// A pane's last cleanly finished turn, so the next turn can continue the agent's own session
// instead of sending the whole conversation again.
export interface LastTurn {
  requestId: string;
  providerId: string;
  modelId: string;
  projectPath: string | null;
  // The pane's messages once the reply was added.
  messageCount: number;
  lastMessageId: string | undefined;
}

// The turn to continue from, when the pane uses the same connection, model and folder, and the
// history about to be sent is exactly what that turn ended with. Undo, restore, retry, branch,
// clearing, and switching provider all change one of these, so they start over with the transcript.
export function resumeFrom(
  last: LastTurn | undefined,
  pane: Pick<PaneState, "providerId" | "modelId" | "projectPath">,
  history: readonly PaneMessage[],
): string | undefined {
  return last !== undefined &&
    last.providerId === pane.providerId &&
    last.modelId === pane.modelId &&
    last.projectPath === pane.projectPath &&
    history.length === last.messageCount &&
    history.at(-1)?.id === last.lastMessageId
    ? last.requestId
    : undefined;
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
