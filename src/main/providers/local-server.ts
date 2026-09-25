import type { ChatChunk, Model, ProviderAdapter, SendMessageRequest } from "../../shared/types";
import { estimateTokens } from "../../shared/tokens";
import { asRecord } from "../cli/cli-adapter";
import { readLines, readSseLines } from "./sse";
import { loadedImages, openAiContent } from "./content";
import { providerFetch } from "./http";

export interface LocalServerOptions {
  id: string;
  label: string;
  baseUrl: string;
  startHint: string;
}

const PROBE_TIMEOUT_MS = 1_500;
// Reading a model's details can wait on a model being loaded.
const DETAILS_TIMEOUT_MS = 5_000;

// ponytail: a fixed ceiling rather than one worked out from free memory; raise it once larger
// windows prove to fit on the computers Zenith runs on.
export const OLLAMA_MAX_CONTEXT = 32_768;
// What Ollama loads a model with when a request doesn't say.
const OLLAMA_DEFAULT_CONTEXT = 4_096;
// Room for the reply on top of the prompt.
const OLLAMA_REPLY_ROOM = 2_048;

// Ollama drops the start of a prompt longer than num_ctx without an error, so every chat sets it.
// Sizes go up in powers of two, so a growing conversation reloads the model a few times rather
// than every turn, and stop at the model's own window and at OLLAMA_MAX_CONTEXT.
export function ollamaContextSize(
  promptTokens: number,
  modelWindow = OLLAMA_DEFAULT_CONTEXT,
): number {
  const ceiling = Math.min(modelWindow, OLLAMA_MAX_CONTEXT);
  let size = OLLAMA_DEFAULT_CONTEXT;
  while (size < promptTokens + OLLAMA_REPLY_ROOM && size < ceiling) size *= 2;
  return Math.min(size, ceiling);
}

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

  async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await providerFetch(`${options.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw notRunning();
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${options.label} request failed: ${response.status} ${text}`.trim());
    }
    return response;
  }

  // Ollama's /api/show gives the window a model was trained with as <architecture>.context_length.
  const ollamaWindows = new Map<string, number>();
  async function ollamaWindow(model: string): Promise<number | undefined> {
    const known = ollamaWindows.get(model);
    if (known) return known;
    const response = await post("/api/show", { model }, AbortSignal.timeout(DETAILS_TIMEOUT_MS));
    const info = asRecord(asRecord(await response.json().catch(() => undefined))?.["model_info"]);
    const size = Object.entries(info ?? {}).find(([key]) => key.endsWith(".context_length"))?.[1];
    if (typeof size !== "number" || size <= 0) return undefined;
    ollamaWindows.set(model, size);
    return size;
  }

  // Ollama's own chat endpoint, since its OpenAI-style one can't set num_ctx.
  async function* sendOllama(req: SendMessageRequest): AsyncIterable<ChatChunk> {
    const promptTokens = estimateTokens(req.messages.map((message) => message.content).join("\n"));
    const window = await ollamaWindow(req.model).catch(() => undefined);
    const response = await post(
      "/api/chat",
      {
        model: req.model,
        stream: true,
        messages: req.messages.map((message) => {
          const images = loadedImages(message).map((image) => image.data);
          return {
            role: message.role,
            content: message.content,
            ...(images.length > 0 ? { images } : {}),
          };
        }),
        options: { num_ctx: ollamaContextSize(promptTokens, window) },
      },
      req.signal,
    );
    let usage: ChatChunk["usage"];
    for await (const line of readLines(response, req.signal)) {
      let chunk: Record<string, unknown> | undefined;
      try {
        chunk = asRecord(JSON.parse(line));
      } catch {
        continue;
      }
      const error = chunk?.["error"];
      if (typeof error === "string") throw new Error(`${options.label} request failed: ${error}`);
      const content = asRecord(chunk?.["message"])?.["content"];
      if (typeof content === "string" && content !== "") yield { delta: content, done: false };
      if (chunk?.["done"] === true) {
        usage = {
          inputTokens: Number(chunk["prompt_eval_count"]) || 0,
          outputTokens: Number(chunk["eval_count"]) || 0,
        };
        break;
      }
    }
    yield { delta: "", done: true, ...(usage ? { usage } : {}) };
  }

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

    async contextLimit(model, inProject) {
      if (options.id === "ollama") {
        const window = (await ollamaWindow(model).catch(() => undefined)) ?? OLLAMA_DEFAULT_CONTEXT;
        // An agent in a project folder talks to Ollama's OpenAI-style endpoint, which can't set
        // num_ctx, so it gets the size Ollama loads by default.
        return Math.min(window, inProject ? OLLAMA_DEFAULT_CONTEXT : OLLAMA_MAX_CONTEXT);
      }
      // LM Studio reports the window a model is loaded with; one not loaded yet has none to give.
      const response = await providerFetch(
        `${options.baseUrl}/api/v0/models/${encodeURIComponent(model)}`,
        { signal: AbortSignal.timeout(DETAILS_TIMEOUT_MS) },
      );
      if (!response.ok) return undefined;
      const loaded = asRecord(await response.json().catch(() => undefined))?.[
        "loaded_context_length"
      ];
      return typeof loaded === "number" && loaded > 0 ? loaded : undefined;
    },

    async *sendMessage(req: SendMessageRequest): AsyncIterable<ChatChunk> {
      if (options.id === "ollama") {
        yield* sendOllama(req);
        return;
      }
      const response = await post(
        "/v1/chat/completions",
        {
          model: req.model,
          stream: true,
          stream_options: { include_usage: true },
          messages: req.messages.map((message) => ({
            role: message.role,
            content: openAiContent(message),
          })),
        },
        req.signal,
      );

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
