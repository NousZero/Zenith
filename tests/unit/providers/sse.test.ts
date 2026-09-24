import { describe, expect, it } from "vitest";

import { readSseLines } from "../../../src/main/providers/sse";

function responseFromChunks(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  return new Response(stream);
}

describe("readSseLines", () => {
  it("yields the payload after data: for each event line", async () => {
    const response = responseFromChunks(['data: {"a":1}\n', 'event: message\ndata: {"a":2}\n\n']);
    const lines: string[] = [];
    for await (const line of readSseLines(response)) lines.push(line);
    expect(lines).toEqual(['{"a":1}', '{"a":2}']);
  });

  it("splits a data: line arriving across two chunks", async () => {
    const response = responseFromChunks(['data: {"a"', ":3}\n"]);
    const lines: string[] = [];
    for await (const line of readSseLines(response)) lines.push(line);
    expect(lines).toEqual(['{"a":3}']);
  });

  it("stops early when the signal is already aborted", async () => {
    const response = responseFromChunks(['data: {"a":1}\n']);
    const controller = new AbortController();
    controller.abort();
    const lines: string[] = [];
    for await (const line of readSseLines(response, controller.signal)) lines.push(line);
    expect(lines).toEqual([]);
  });
});
