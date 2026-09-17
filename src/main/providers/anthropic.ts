import type {
  ChatChunk,
  ChatMessage,
  Model,
  ProviderAdapter,
  SendMessageRequest,
} from "../../shared/types";
import { anthropicContent } from "./content";
import { readSseLines } from "./sse";

const API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

function splitSystemPrompt(messages: ChatMessage[]): {
  system: string | undefined;
  rest: { role: "user" | "assistant"; content: string | Record<string, unknown>[] }[];
} {
  const systemLines = messages.filter((message) => message.role === "system").map((m) => m.content);
  const rest = messages
    .filter(
      (message): message is ChatMessage & { role: "user" | "assistant" } =>
        message.role !== "system",
    )
    .map((message) => ({ role: message.role, content: anthropicContent(message) }));
  return { system: systemLines.length > 0 ? systemLines.join("\n") : undefined, rest };
}

export function createAnthropicAdapter(getApiKey: () => Promise<string>): ProviderAdapter {
  return {
    id: "anthropic",

    async listModels(): Promise<Model[]> {
      return [
        { id: "claude-opus-5", label: "Claude Opus 5" },
        { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
        { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      ];
    },

    async validateCredential(cred: string): Promise<boolean> {
      const response = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": cred,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [] }),
      });
      return response.status !== 401 && response.status !== 403;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      const apiKey = await getApiKey();
      const { system, rest } = splitSystemPrompt(req.messages);
      const response = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: 4096,
          stream: true,
          ...(system ? { system } : {}),
          messages: rest,
        }),
        ...(req.signal ? { signal: req.signal } : {}),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Anthropic request failed: ${response.status} ${text}`);
      }
      for await (const payload of readSseLines(response, req.signal)) {
        const parsed = JSON.parse(payload) as {
          type: string;
          delta?: { text?: string };
        };
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          yield { delta: parsed.delta.text, done: false };
        } else if (parsed.type === "message_stop") {
          yield { delta: "", done: true };
          return;
        }
      }
      yield { delta: "", done: true };
    },
  };
}
