import { afterEach, describe, expect, it, vi } from "vitest";

import { createOpenRouterAdapter } from "../../../src/main/providers/openrouter";

function sseResponse(events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${event}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("createOpenRouterAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams concatenated text deltas and a final done chunk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
        "[DONE]",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createOpenRouterAdapter(async () => "or-test");
    const chunks = [];
    for await (const chunk of adapter.sendMessage({
      model: "meta-llama/llama-3.1-70b-instruct",
      messages: [{ role: "user", content: "hi" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { delta: "Hel", done: false },
      { delta: "lo", done: false },
      { delta: "", done: true },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer or-test" }),
      }),
    );
  });

  it("lists models from the OpenRouter catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: "openai/gpt-4o", name: "OpenAI: GPT-4o" }] }),
          { status: 200 },
        ),
      ),
    );
    const adapter = createOpenRouterAdapter(async () => "or-test");
    await expect(adapter.listModels()).resolves.toEqual([
      { id: "openai/gpt-4o", label: "OpenAI: GPT-4o" },
    ]);
  });
});
