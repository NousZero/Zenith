import type { ChatMessage, ImageAttachment, PaneState } from "./types";

// persona is the SOUL.md text plus the session personality, already combined.
export function buildFanOutMessages(
  pane: PaneState,
  prompt: string,
  memoryText: string,
  persona = "",
  images: ImageAttachment[] = [],
): ChatMessage[] {
  const trimmedMemory = memoryText.trim();
  const systemText = [persona.trim(), pane.memoryEnabled ? trimmedMemory : ""]
    .filter((part) => part.length > 0)
    .join("\n\n");
  const systemMessage: ChatMessage[] =
    systemText.length > 0 ? [{ role: "system", content: systemText }] : [];
  // Providers get only role and content; stored ids stay inside Zenith.
  const history = pane.messages.map(({ role, content, images: attached }) => ({
    role,
    content,
    ...(attached?.length
      ? { images: attached.map(({ id, mediaType }) => ({ id, mediaType })) }
      : {}),
  }));
  return [
    ...systemMessage,
    ...history,
    { role: "user", content: prompt, ...(images.length ? { images } : {}) },
  ];
}
