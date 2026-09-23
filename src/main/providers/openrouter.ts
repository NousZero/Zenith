import type { ChatChunk, Model, ProviderAdapter, SendMessageRequest } from "../../shared/types";
import { openAiContent } from "./content";
import { readSseLines } from "./sse";
import { providerFetch } from "./http";

const API_BASE = "https://openrouter.ai/api/v1";

export function createOpenRouterAdapter(getApiKey: () => Promise<string>): ProviderAdapter {
  return {
    id: "openrouter",

    async listModels(): Promise<Model[]> {
      const response = await providerFetch(`${API_BASE}/models`);
      if (!response.ok) throw new Error(`OpenRouter model list failed: ${response.status}`);
      const body = (await response.json()) as { data: { id: string; name: string }[] };
      return body.data.map((model) => ({ id: model.id, label: model.name }));
    },

    async validateCredential(cred: string): Promise<boolean> {
      const response = await providerFetch(`${API_BASE}/auth/key`, {
        headers: { Authorization: `Bearer ${cred}` },
      });
      return response.ok;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      const apiKey = await getApiKey();
      const response = await providerFetch(`${API_BASE}/chat/completions`, {
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
        throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
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
