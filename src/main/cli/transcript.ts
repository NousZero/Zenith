import type { ChatMessage, ImageAttachment } from "../../shared/types";

export interface CliPrompt {
  system: string | undefined;
  prompt: string;
  // Images on the latest message; earlier images travel only as text in the transcript.
  images?: ImageAttachment[];
}

// CLI tools run one stateless process per turn, so earlier turns travel inside the prompt.
export function buildCliPrompt(messages: ChatMessage[]): CliPrompt {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const conversation = messages.filter((message) => message.role !== "system");
  const latest = conversation.at(-1);
  if (!latest || latest.role !== "user") {
    throw new Error("The conversation must end with a user message.");
  }

  const system = systemText === "" ? undefined : systemText;
  const images = latest.images?.length ? { images: latest.images } : {};
  const history = conversation.slice(0, -1);
  if (history.length === 0) return { system, prompt: latest.content, ...images };

  const transcript = history
    .map((message) => `<${message.role}>\n${message.content}\n</${message.role}>`)
    .join("\n\n");
  return {
    system,
    ...images,
    prompt: `Here is our conversation so far:\n\n${transcript}\n\nReply to my latest message:\n\n<user>\n${latest.content}\n</user>`,
  };
}

// Instructions and the newest message only, for an agent continuing its own session, which
// already holds the earlier turns.
export function latestPrompt(messages: ChatMessage[]): CliPrompt {
  return buildCliPrompt(
    messages.filter((message, index) => message.role === "system" || index === messages.length - 1),
  );
}

export function withSystemPreamble({ system, prompt }: CliPrompt): string {
  return system === undefined ? prompt : `Follow these instructions:\n${system}\n\n${prompt}`;
}

// Model ids and Claude Code's aliases, including bracketed ones such as opus[1m].
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/[\]-]{0,119}$/;

export function assertSafeModelId(model: string): string {
  if (!SAFE_MODEL_ID.test(model)) throw new Error(`Unsupported model id: ${model}`);
  return model;
}
