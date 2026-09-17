import type { ChatMessage } from "../../shared/types";

// Message content in each API's own shape: plain text when there are no images, otherwise a
// list of parts. Only images whose data the main process has loaded are sent.
function loadedImages(message: ChatMessage) {
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
