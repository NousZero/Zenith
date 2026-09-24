import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { createAcpAdapter } from "../../src/main/acp/acp-adapter";
import type { ChatChunk, ChatMessage, SendMessageRequest } from "../../src/shared/types";

const agentScript = join(import.meta.dirname, "..", "fixtures", "fake-acp-agent.mjs");

function makeAdapter(env: Record<string, string> = {}, idleCloseMs?: number) {
  return createAcpAdapter(
    { id: "fake-agent", label: "Fake agent", args: [agentScript] },
    {
      resolveBinary: async () => process.execPath,
      childEnv: () => ({ PATH: process.env["PATH"] ?? "", ...env }),
      cwd: tmpdir(),
      clientVersion: "test",
      mcpServers: async () => [],
      ...(idleCloseMs === undefined ? {} : { idleCloseMs }),
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

describe("signing in to an ACP agent that asks for it", () => {
  it("authenticates with the agent's sign-in method, then opens the session", async () => {
    const adapter = makeAdapter({ FAKE_ACP_SIGN_IN: "works" });
    const { text } = await reply(adapter, { messages: [{ role: "user", content: "hello" }] });
    expect(text).toContain("hello");
  });

  it("reports the agent's own sign-in explanation when no method works", async () => {
    const adapter = makeAdapter({ FAKE_ACP_SIGN_IN: "unsupported" });
    await expect(
      reply(adapter, { messages: [{ role: "user", content: "hello" }] }),
    ).rejects.toThrow(
      "Gemini API key is missing or not configured. This client is no longer supported for your account.",
    );
  });
});

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

  it("continues the session when the window names the last turn, and starts over otherwise", async () => {
    adapter = makeAdapter();
    const first: ChatMessage[] = [{ role: "user", content: "one" }];
    const firstReply = await reply(adapter, { messages: first, turnId: "t1" });
    expect(firstReply.text).toBe("s1|default|one");
    const history: ChatMessage[] = [...first, { role: "assistant", content: firstReply.text }];

    const second = await reply(adapter, {
      messages: [...history, { role: "user", content: "two" }],
      turnId: "t2",
      resumeFrom: "t1",
    });
    expect(second.text).toBe("s1|default|two");
    expect(second.chunks.at(-1)).toMatchObject({ done: true, resumed: true });

    // Undo: the window no longer names a turn to continue, so the agent gets a fresh transcript.
    const retried = await reply(adapter, {
      messages: [...history, { role: "user", content: "again" }],
      turnId: "t3",
    });
    expect(retried.text).toMatch(/^s2\|default\|Here is our conversation so far/);
    expect(retried.text).toContain("<user>\nagain\n</user>");
    expect(retried.chunks.at(-1)?.resumed).toBeUndefined();
  });

  it("starts over when the instructions changed since the kept turn", async () => {
    adapter = makeAdapter();
    const first: ChatMessage[] = [
      { role: "system", content: "Be terse." },
      { role: "user", content: "one" },
    ];
    const firstReply = await reply(adapter, { messages: first, turnId: "t1" });
    const { text } = await reply(adapter, {
      messages: [
        { role: "system", content: "Be chatty." },
        { role: "user", content: "one" },
        { role: "assistant", content: firstReply.text },
        { role: "user", content: "two" },
      ],
      turnId: "t2",
      resumeFrom: "t1",
    });
    expect(text).toMatch(/^s2\|default\|Follow these instructions:\nBe chatty\./);
  });

  it("sends the whole transcript in the same turn when the kept session is gone", async () => {
    adapter = makeAdapter();
    const first: ChatMessage[] = [{ role: "user", content: "FORGET" }];
    const firstReply = await reply(adapter, { messages: first, turnId: "t1" });
    const { text, chunks } = await reply(adapter, {
      messages: [
        ...first,
        { role: "assistant", content: firstReply.text },
        { role: "user", content: "two" },
      ],
      turnId: "t2",
      resumeFrom: "t1",
    });
    expect(text).toMatch(/^s2\|default\|Here is our conversation so far/);
    expect(text).toContain("<user>\ntwo\n</user>");
    expect(chunks.at(-1)?.resumed).toBeUndefined();
  });

  it("asks the pane of a continued session for approval", async () => {
    adapter = makeAdapter();
    const first: ChatMessage[] = [{ role: "user", content: "one" }];
    const firstReply = await reply(adapter, { messages: first, turnId: "t1" });
    const titles: string[] = [];
    const { text, chunks } = await reply(adapter, {
      messages: [
        ...first,
        { role: "assistant", content: firstReply.text },
        { role: "user", content: "PERMISSION" },
      ],
      turnId: "t2",
      resumeFrom: "t1",
      requestPermission: async (prompt) => {
        titles.push(prompt.title);
        return "yes";
      },
    });
    expect(titles).toEqual(["rm -rf build"]);
    expect(text).toBe('outcome={"outcome":"selected","optionId":"yes"}');
    expect(chunks.at(-1)?.resumed).toBe(true);
  });

  it("closes an idle agent, after which the next turn starts over with the transcript", async () => {
    adapter = makeAdapter({}, 20);
    const first: ChatMessage[] = [{ role: "user", content: "one" }];
    const firstReply = await reply(adapter, { messages: first, turnId: "t1" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const { text } = await reply(adapter, {
      messages: [
        ...first,
        { role: "assistant", content: firstReply.text },
        { role: "user", content: "two" },
      ],
      turnId: "t2",
      resumeFrom: "t1",
    });
    // A new process numbers its sessions from s1 again.
    expect(text).toMatch(/^s1\|default\|Here is our conversation so far/);
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
