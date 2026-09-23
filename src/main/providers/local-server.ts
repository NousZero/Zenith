import type { ChatChunk, Model, ProviderAdapter, SendMessageRequest } from "../../shared/types";
import { asRecord } from "../cli/cli-adapter";
import { readSseLines } from "./sse";
import { openAiContent } from "./content";
import { providerFetch } from "./http";

export interface LocalServerOptions {
  id: string;
  label: string;
  baseUrl: string;
  startHint: string;
}

const PROBE_TIMEOUT_MS = 1_500;

// A non-AI server can answer on the same port, so only a real OpenAI-style list counts.
export async function fetchLocalModels(
  baseUrl: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<Model[]> {
  const response = await providerFetch(`${baseUrl}/v1/models`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Model list failed: HTTP ${response.status}`);
  const body = asRecord(await response.json().catch(() => undefined));
  const data = body?.["data"];
  if (!Array.isArray(data)) throw new Error("Not an OpenAI-compatible model server.");
  return data
    .map((entry) => asRecord(entry)?.["id"])
    .filter((id): id is string => typeof id === "string" && id !== "")
    .map((id) => ({ id, label: id }));
}

export function createLocalServerAdapter(options: LocalServerOptions): ProviderAdapter {
  const notRunning = () => new Error(`${options.label} isn't running. ${options.startHint}`);

  return {
    id: options.id,

    async listModels() {
      try {
        return await fetchLocalModels(options.baseUrl);
      } catch {
        return [];
      }
    },

    async validateCredential() {
      return true;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      let response: Response;
      try {
        response = await providerFetch(`${options.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: req.model,
            stream: true,
            stream_options: { include_usage: true },
            messages: req.messages.map((message) => ({
              role: message.role,
              content: openAiContent(message),
            })),
          }),
          ...(req.signal ? { signal: req.signal } : {}),
        });
      } catch (error) {
        if (req.signal?.aborted) throw error;
        throw notRunning();
      }
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`${options.label} request failed: ${response.status} ${text}`.trim());
      }

      let usage: ChatChunk["usage"];
      for await (const payload of readSseLines(response, req.signal)) {
        if (payload === "[DONE]") break;
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const chunk = asRecord(parsed);
        const reportedUsage = asRecord(chunk?.["usage"]);
        if (reportedUsage) {
          usage = {
            inputTokens: Number(reportedUsage["prompt_tokens"]) || 0,
            outputTokens: Number(reportedUsage["completion_tokens"]) || 0,
          };
        }
        const choices = chunk?.["choices"];
        const delta = Array.isArray(choices)
          ? asRecord(asRecord(choices[0])?.["delta"])
          : undefined;
        const content = delta?.["content"];
        if (typeof content === "string" && content !== "") yield { delta: content, done: false };
      }
      yield { delta: "", done: true, ...(usage ? { usage } : {}) };
    },
  };
}
