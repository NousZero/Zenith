import type { ChatMessage, TokenUsage } from "../../shared/types";

// Message content in each API's own shape: plain text when there are no images, otherwise a
// list of parts. Only images whose data the main process has loaded are sent.
export function loadedImages(message: ChatMessage) {
  return (message.images ?? []).flatMap((image) =>
    image.data ? [{ mediaType: image.mediaType, data: image.data }] : [],
  );
}

export function openAiContent(message: ChatMessage): string | Record<string, unknown>[] {
  const images = loadedImages(message);
  if (images.length === 0) return message.content;
  return [
    ...(message.content ? [{ type: "text", text: message.content }] : []),
    ...images.map((image) => ({
      type: "image_url",
      image_url: { url: `data:${image.mediaType};base64,${image.data}` },
    })),
  ];
}

export function anthropicContent(message: ChatMessage): string | Record<string, unknown>[] {
  const images = loadedImages(message);
  if (images.length === 0) return message.content;
  return [
    ...images.map((image) => ({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data },
    })),
    ...(message.content ? [{ type: "text", text: message.content }] : []),
  ];
}

// Anthropic prompt caching. A breakpoint on the system prompt caches the tools and instructions;
// one on the last block of the last message caches the whole conversation so far, and the next
// request, which repeats it and adds one more turn, reads it back. Two of the four allowed.
const EPHEMERAL = { cache_control: { type: "ephemeral" } };

export function cachedSystem(system: string): Record<string, unknown>[] {
  return [{ type: "text", text: system, ...EPHEMERAL }];
}

export function withCacheBreakpoint<T extends { content: string | unknown[] }>(messages: T[]): T[] {
  const last = messages.at(-1);
  if (!last) return messages;
  const blocks =
    typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content;
  const final = blocks.at(-1);
  if (typeof final !== "object" || final === null) return messages;
  return [
    ...messages.slice(0, -1),
    { ...last, content: [...blocks.slice(0, -1), { ...final, ...EPHEMERAL }] },
  ];
}

// Anthropic counts uncached, cache-read and cache-written input apart; together they are the
// prompt's size, and the cache counts are kept to show what caching saved.
export function anthropicUsage(usage: Record<string, unknown> | undefined): TokenUsage {
  const read = Number(usage?.["cache_read_input_tokens"]) || 0;
  const write = Number(usage?.["cache_creation_input_tokens"]) || 0;
  return {
    inputTokens: (Number(usage?.["input_tokens"]) || 0) + read + write,
    outputTokens: Number(usage?.["output_tokens"]) || 0,
    ...(read ? { cacheReadTokens: read } : {}),
    ...(write ? { cacheWriteTokens: write } : {}),
  };
}
