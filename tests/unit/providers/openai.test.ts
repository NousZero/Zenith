import { afterEach, describe, expect, it, vi } from "vitest";

import { createOpenAiAdapter } from "../../../src/main/providers/openai";

function sseResponse(events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events)
        controller.enqueue(new TextEncoder().encode(`data: ${event}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("createOpenAiAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams concatenated text deltas and a final done chunk", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
          JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
          "[DONE]",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createOpenAiAdapter(async () => "sk-test");
    const chunks = [];
    for await (const chunk of adapter.sendMessage({
      model: "gpt-4o-mini",
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
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      }),
    );
  });

  it("throws with the response body when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })));
    const adapter = createOpenAiAdapter(async () => "sk-bad");
    const stream = adapter.sendMessage({ model: "gpt-4o-mini", messages: [] });
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow("OpenAI request failed: 401");
  });

  it("reports credential validity from the models endpoint status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const adapter = createOpenAiAdapter(async () => "sk-test");
    await expect(adapter.validateCredential("sk-test")).resolves.toBe(true);
  });
});
