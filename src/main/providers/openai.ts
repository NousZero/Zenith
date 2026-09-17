import type { ChatChunk, Model, ProviderAdapter, SendMessageRequest } from "../../shared/types";
import { openAiContent } from "./content";
import { readSseLines } from "./sse";

const API_BASE = "https://api.openai.com/v1";

export function createOpenAiAdapter(getApiKey: () => Promise<string>): ProviderAdapter {
  return {
    id: "openai",

    async listModels(): Promise<Model[]> {
      const apiKey = await getApiKey();
      const response = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(`OpenAI model list failed: ${response.status}`);
      const body = (await response.json()) as { data: { id: string }[] };
      return body.data
        .filter((model) => model.id.startsWith("gpt-") || model.id.startsWith("o"))
        .map((model) => ({ id: model.id, label: model.id }));
    },

    async validateCredential(cred: string): Promise<boolean> {
      const response = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${cred}` },
      });
      return response.ok;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      const apiKey = await getApiKey();
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          stream: true,
          messages: req.messages.map((message) => ({
            role: message.role,
            content: openAiContent(message),
          })),
        }),
        ...(req.signal ? { signal: req.signal } : {}),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`OpenAI request failed: ${response.status} ${text}`);
      }
      for await (const payload of readSseLines(response, req.signal)) {
        if (payload === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }
        const parsed = JSON.parse(payload) as { choices: { delta: { content?: string } }[] };
        const delta = parsed.choices[0]?.delta.content ?? "";
        if (delta) yield { delta, done: false };
      }
      yield { delta: "", done: true };
    },
  };
}
