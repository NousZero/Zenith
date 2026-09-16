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
    // Shape captured from Ollama 0.30.11's /v1/chat/completions stream.
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
      id: "ollama",
      label: "Ollama",
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
