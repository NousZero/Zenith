import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createLocalServerAdapter, fetchLocalModels } from "../../src/main/providers/local-server";
import type { ChatChunk } from "../../src/shared/types";

let server: Server | undefined;

async function startServer(handler: Parameters<typeof createServer>[1]): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe("fetchLocalModels", () => {
  it("lists models from an OpenAI-compatible server", async () => {
    const baseUrl = await startServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ object: "list", data: [{ id: "qwen2.5vl:7b" }] }));
    });
    await expect(fetchLocalModels(baseUrl)).resolves.toEqual([
      { id: "qwen2.5vl:7b", label: "qwen2.5vl:7b" },
    ]);
  });

  it("does not mistake an unrelated web app on the port for a model server", async () => {
    const baseUrl = await startServer((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end("<!doctype html><html></html>");
    });
    await expect(fetchLocalModels(baseUrl)).rejects.toThrow();
  });
});

describe("createLocalServerAdapter", () => {
  it("streams content and reports usage from the final chunk", async () => {
    // Shape captured from Ollama 0.30.11's /v1/chat/completions stream, which LM Studio shares.
    const baseUrl = await startServer((_req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      const events = [
        {
          choices: [{ index: 0, delta: { role: "assistant", content: "po" }, finish_reason: null }],
        },
        {
          choices: [{ index: 0, delta: { role: "assistant", content: "ng" }, finish_reason: null }],
        },
        { choices: [], usage: { prompt_tokens: 24, completion_tokens: 2, total_tokens: 26 } },
      ];
      for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end("data: [DONE]\n\n");
    });
    const adapter = createLocalServerAdapter({
      id: "lmstudio",
      label: "LM Studio",
      baseUrl,
      startHint: "Start it.",
    });
    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.sendMessage({
      model: "qwen2.5vl:7b",
      messages: [{ role: "user", content: "hi" }],
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([
      { delta: "po", done: false },
      { delta: "ng", done: false },
      { delta: "", done: true, usage: { inputTokens: 24, outputTokens: 2 } },
    ]);
  });

  it("sends Ollama chats to its own endpoint with num_ctx sized to the prompt", async () => {
    const bodies: Record<string, unknown>[] = [];
    const baseUrl = await startServer((req, res) => {
      let text = "";
      req.on("data", (chunk: Buffer) => (text += chunk.toString()));
      req.on("end", () => {
        if (req.url === "/api/show") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ model_info: { "gemma2.context_length": 8192 } }));
          return;
        }
        bodies.push(JSON.parse(text) as Record<string, unknown>);
        res.setHeader("Content-Type", "application/x-ndjson");
        res.write(
          `${JSON.stringify({ message: { role: "assistant", content: "hi" }, done: false })}\n`,
        );
        res.end(
          `${JSON.stringify({ message: { role: "assistant", content: "" }, done: true, prompt_eval_count: 5000, eval_count: 3 })}\n`,
        );
      });
    });
    const adapter = createLocalServerAdapter({
      id: "ollama",
      label: "Ollama",
      baseUrl,
      startHint: "Start it.",
    });
    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.sendMessage({
      model: "gemma2:9b",
      // About 5,000 tokens: past the 4k default, so the next size up.
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "x".repeat(20_000) },
      ],
    })) {
      chunks.push(chunk);
    }
    expect(bodies[0]).toMatchObject({
      model: "gemma2:9b",
      stream: true,
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "x".repeat(20_000) },
      ],
      options: { num_ctx: 8192 },
    });
    expect(chunks).toEqual([
      { delta: "hi", done: false },
      { delta: "", done: true, usage: { inputTokens: 5000, outputTokens: 3 } },
    ]);
    // Chats may use the model's window up to the ceiling; agents only Ollama's default.
    await expect(adapter.contextLimit?.("gemma2:9b", false)).resolves.toBe(8192);
    await expect(adapter.contextLimit?.("gemma2:9b", true)).resolves.toBe(4096);
  });

  it("reads the window LM Studio loaded a model with", async () => {
    const baseUrl = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          req.url === "/api/v0/models/qwen3-8b"
            ? {
                id: "qwen3-8b",
                state: "loaded",
                max_context_length: 32768,
                loaded_context_length: 4096,
              }
            : { id: "other", state: "not-loaded", max_context_length: 32768 },
        ),
      );
    });
    const adapter = createLocalServerAdapter({
      id: "lmstudio",
      label: "LM Studio",
      baseUrl,
      startHint: "Start it.",
    });
    await expect(adapter.contextLimit?.("qwen3-8b", false)).resolves.toBe(4096);
    await expect(adapter.contextLimit?.("other", false)).resolves.toBeUndefined();
  });

  it("explains how to start the server when nothing is listening", async () => {
    const adapter = createLocalServerAdapter({
      id: "lmstudio",
      label: "LM Studio",
      baseUrl: "http://127.0.0.1:9",
      startHint: "Start the local server.",
    });
    const stream = adapter.sendMessage({ model: "m", messages: [{ role: "user", content: "hi" }] });
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow(
      "LM Studio isn't running. Start the local server.",
    );
  });
});
