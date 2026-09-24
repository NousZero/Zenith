import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnthropicAdapter } from "../../../src/main/providers/anthropic";

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

describe("createAnthropicAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams content_block_delta text and stops at message_stop", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
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
    const body = JSON.parse(options.body as string) as { system?: unknown; messages: unknown[] };
    expect(body.system).toEqual([
      { type: "text", text: "Be terse.", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }],
      },
    ]);
    expect(options.headers).toMatchObject({ "x-api-key": "sk-ant-test" });
  });

  it("caches the system prompt and the conversation up to the newest message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          type: "message_start",
          message: {
            usage: {
              input_tokens: 12,
              cache_read_input_tokens: 2000,
              cache_creation_input_tokens: 300,
              output_tokens: 1,
            },
          },
        }),
        JSON.stringify({ type: "content_block_delta", delta: { text: "ok" } }),
        JSON.stringify({ type: "message_delta", usage: { output_tokens: 9 } }),
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
        { role: "user", content: "first" },
        { role: "assistant", content: "one" },
        { role: "user", content: "second" },
      ],
    })) {
      chunks.push(chunk);
    }

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { messages: unknown[] };
    // Earlier turns go unchanged; only the newest message carries the breakpoint.
    expect(body.messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "one" },
      {
        role: "user",
        content: [{ type: "text", text: "second", cache_control: { type: "ephemeral" } }],
      },
    ]);
    expect(chunks.at(-1)).toEqual({
      delta: "",
      done: true,
      usage: {
        inputTokens: 2312,
        outputTokens: 9,
        cacheReadTokens: 2000,
        cacheWriteTokens: 300,
      },
    });
  });

  it("throws with the response body when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })));
    const adapter = createAnthropicAdapter(async () => "sk-ant-bad");
    const stream = adapter.sendMessage({ model: "claude-sonnet-5", messages: [] });
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow("Anthropic request failed: 401");
  });
});
