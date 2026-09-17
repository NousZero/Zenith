// Connections that accept pasted images; the others refuse a message that carries one.
export function takesImages(providerId: string): boolean {
  return (
    ["claude-code", "openai", "anthropic", "openrouter", "ollama", "lmstudio"].includes(
      providerId,
    ) || providerId.startsWith("custom:")
  );
}

export const MAX_IMAGES_PER_MESSAGE = 6;
