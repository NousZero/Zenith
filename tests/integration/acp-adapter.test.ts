import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { createAcpAdapter } from "../../src/main/acp/acp-adapter";
import type { ChatChunk, ChatMessage, SendMessageRequest } from "../../src/shared/types";

const agentScript = join(import.meta.dirname, "..", "fixtures", "fake-acp-agent.mjs");

function makeAdapter() {
  return createAcpAdapter(
    { id: "fake-agent", label: "Fake agent", args: [agentScript] },
    {
      resolveBinary: async () => process.execPath,
      childEnv: () => ({ PATH: process.env["PATH"] ?? "" }),
      cwd: tmpdir(),
      clientVersion: "test",
      mcpServers: async () => [],
    },
  );
}

async function reply(
  adapter: ReturnType<typeof makeAdapter>,
  request: Partial<SendMessageRequest> & { messages: ChatMessage[] },
): Promise<{ text: string; chunks: ChatChunk[] }> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of adapter.sendMessage({
    model: "default",
    conversationId: "pane-1",
    ...request,
  })) {
    chunks.push(chunk);
  }
  return { text: chunks.map((chunk) => chunk.delta).join(""), chunks };
}

describe("createAcpAdapter with a real child process", () => {
  let adapter: ReturnType<typeof makeAdapter> | undefined;

  afterEach(() => {
    adapter?.dispose();
    adapter = undefined;
  });

  it("streams a reply, reports usage, and lists models from the agent", async () => {
    adapter = makeAdapter();
    await expect(adapter.listModels()).resolves.toEqual([
      { id: "default", label: "Default" },
      { id: "m1", label: "Model One" },
    ]);
    const { text, chunks } = await reply(adapter, {
      messages: [{ role: "user", content: "hello" }],
    });
    // The session opened while listing models is reused for the first turn.
    expect(text).toBe("s1|default|hello");
    expect(chunks.at(-1)).toEqual({
      delta: "",
      done: true,
      usage: { inputTokens: 11, outputTokens: 5 },
      contextWindow: 64000,
    });
  });

  it("reuses the session while history matches and starts over when it diverges", async () => {
    adapter = makeAdapter();
    const first: ChatMessage[] = [{ role: "user", content: "one" }];
    const firstReply = await reply(adapter, { messages: first });
    expect(firstReply.text).toBe("s1|default|one");

    const second = await reply(adapter, {
      messages: [
        ...first,
        { role: "assistant", content: firstReply.text },
        { role: "user", content: "two" },
      ],
    });
    expect(second.text).toBe("s1|default|two");

    // Undo: the pane no longer holds "two" or its reply, so the agent gets a fresh transcript.
    const retried = await reply(adapter, {
      messages: [
        ...first,
        { role: "assistant", content: firstReply.text },
        { role: "user", content: "again" },
      ],
    });
    expect(retried.text).toMatch(/^s2\|default\|Here is our conversation so far/);
    expect(retried.text).toContain("<user>\nagain\n</user>");
  });

  it("sets the model on a new session", async () => {
    adapter = makeAdapter();
    const { text } = await reply(adapter, {
      model: "m1",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(text).toBe("s1|m1|hi");
  });

  it("asks for approval and returns the chosen option to the agent", async () => {
    adapter = makeAdapter();
    const prompts: unknown[] = [];
    const { text } = await reply(adapter, {
      messages: [{ role: "user", content: "PERMISSION" }],
      requestPermission: async (prompt) => {
        prompts.push(prompt);
        return "no";
      },
    });
    expect(prompts).toEqual([
      {
        title: "rm -rf build",
        options: [
          { id: "yes", label: "Allow once", kind: "allow_once" },
          { id: "no", label: "Deny", kind: "reject_once" },
        ],
      },
    ]);
    expect(text).toBe('outcome={"outcome":"selected","optionId":"no"}');
  });

  it("cancels approval when no one can answer", async () => {
    adapter = makeAdapter();
    const { text } = await reply(adapter, { messages: [{ role: "user", content: "PERMISSION" }] });
    expect(text).toBe('outcome={"outcome":"cancelled"}');
  });

  it("sends session/cancel on abort and ends without a done chunk", async () => {
    adapter = makeAdapter();
    const controller = new AbortController();
    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.sendMessage({
      model: "default",
      conversationId: "pane-1",
      messages: [{ role: "user", content: "HANG" }],
      signal: controller.signal,
    })) {
      chunks.push(chunk);
      controller.abort();
    }
    expect(chunks).toEqual([{ delta: "working", done: false }]);
  });

  it("reports an agent crash with its stderr and recovers on the next turn", async () => {
    adapter = makeAdapter();
    await expect(
      reply(adapter, { messages: [{ role: "user", content: "CRASH" }] }),
    ).rejects.toThrow("fake agent crashed on purpose");
    const { text } = await reply(adapter, { messages: [{ role: "user", content: "back" }] });
    expect(text).toBe("s1|default|back");
  });
});
