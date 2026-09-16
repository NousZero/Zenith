import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnthropicAdapter } from "../../../src/main/providers/anthropic";

function sseResponse(events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(new TextEncoder().encode(`data: ${event}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("createAnthropicAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams content_block_delta text and stops at message_stop", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ type: "content_block_delta", delta: { text: "Hel" } }),
        JSON.stringify({ type: "content_block_delta", delta: { text: "lo" } }),
        JSON.stringify({ type: "message_stop" }),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createAnthropicAdapter(async () => "sk-ant-test");
    const chunks = [];
    for await (const chunk of adapter.sendMessage({
      model: "claude-sonnet-5",
      messages: [
        { role: "system", content: "Be terse." },
        { role: "user", content: "hi" },
      ],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { delta: "Hel", done: false },
      { delta: "lo", done: false },
      { delta: "", done: true },
    ]);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { system?: string; messages: unknown[] };
    expect(body.system).toBe("Be terse.");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(options.headers).toMatchObject({ "x-api-key": "sk-ant-test" });
  });

  it("throws with the response body when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })),
    );
    const adapter = createAnthropicAdapter(async () => "sk-ant-bad");
    const iterator = adapter.sendMessage({ model: "claude-sonnet-5", messages: [] })[
      Symbol.asyncIterator
    ]();
    await expect(iterator.next()).rejects.toThrow("Anthropic request failed: 401");
  });
});
