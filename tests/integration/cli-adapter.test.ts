import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAgentSessions } from "../../src/main/cli/agent-sessions";
import { createCliAdapter, parseJsonLine, type CliToolSpec } from "../../src/main/cli/cli-adapter";
import type { ChatChunk, ChatMessage } from "../../src/shared/types";

// A fake CLI: node evaluates a script that plays the part of claude/gemini/copilot.
function fakeCliSpec(script: string): CliToolSpec {
  return {
    id: "fake-cli",
    label: "Fake CLI",
    listModels: async () => [],
    buildInvocation: (_model, { prompt }) => ({ args: ["-e", script], stdin: prompt }),
    parseLine(line) {
      const event = parseJsonLine(line);
      if (!event) return undefined;
      if (event["t"] === "delta") return { delta: String(event["v"]) };
      if (event["t"] === "usage") return { usage: { inputTokens: 7, outputTokens: 3 } };
      if (event["t"] === "error") return { error: String(event["v"]) };
      return undefined;
    },
    describeFailure: (exit) => `fake failed with ${exit.exitCode}: ${exit.stderr.trim()}`,
  };
}

async function collect(iterable: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

describe("createCliAdapter with a real child process", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "zenith-cli-"));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  const deps = (binary = process.execPath) => ({
    resolveBinary: async () => binary,
    childEnv: () => process.env,
    cwd: sandbox,
  });

  it("streams deltas produced from the stdin prompt and reports usage when done", async () => {
    const script = `
      let input = "";
      process.stdin.on("data", (c) => (input += c));
      process.stdin.on("end", () => {
        console.log("noise that is not json");
        for (const word of input.split(" ")) console.log(JSON.stringify({ t: "delta", v: word + "|" }));
        console.log(JSON.stringify({ t: "usage" }));
        console.log(JSON.stringify({ t: "cwd", v: process.cwd() }));
      });`;
    const adapter = createCliAdapter(fakeCliSpec(script), deps());
    const chunks = await collect(
      adapter.sendMessage({
        model: "default",
        messages: [{ role: "user", content: "hello there" }],
      }),
    );
    expect(chunks).toEqual([
      { delta: "hello|", done: false },
      { delta: "there|", done: false },
      { delta: "", done: true, usage: { inputTokens: 7, outputTokens: 3 } },
    ]);
  });

  it("runs in the sandbox directory, not the app's working directory", async () => {
    const script = `console.log(JSON.stringify({ t: "delta", v: process.cwd() }));`;
    const adapter = createCliAdapter(fakeCliSpec(script), deps());
    const [first] = await collect(
      adapter.sendMessage({ model: "default", messages: [{ role: "user", content: "x" }] }),
    );
    expect(first?.delta.endsWith(sandbox.split("/").at(-1) ?? "")).toBe(true);
  });

  it("throws the spec's failure description when the process fails without output", async () => {
    const script = `process.stderr.write("not signed in\\n"); process.exit(3);`;
    const adapter = createCliAdapter(fakeCliSpec(script), deps());
    await expect(
      collect(
        adapter.sendMessage({ model: "default", messages: [{ role: "user", content: "x" }] }),
      ),
    ).rejects.toThrow("fake failed with 3: not signed in");
  });

  it("prefers an error reported in the stream over the exit code", async () => {
    const script = `console.log(JSON.stringify({ t: "error", v: "rate limited" })); process.exit(1);`;
    const adapter = createCliAdapter(fakeCliSpec(script), deps());
    await expect(
      collect(
        adapter.sendMessage({ model: "default", messages: [{ role: "user", content: "x" }] }),
      ),
    ).rejects.toThrow("rate limited");
  });

  it("stops a long-running process when the request is aborted", async () => {
    const script = `
      console.log(JSON.stringify({ t: "delta", v: "partial" }));
      setInterval(() => {}, 1000);`;
    const adapter = createCliAdapter(fakeCliSpec(script), deps());
    const controller = new AbortController();
    const started = Date.now();
    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.sendMessage({
      model: "default",
      messages: [{ role: "user", content: "x" }],
      signal: controller.signal,
    })) {
      chunks.push(chunk);
      controller.abort();
    }
    expect(chunks).toEqual([{ delta: "partial", done: false }]);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("shows the tool's latest warning once while it is silent, then streams on", async () => {
    const script = `
      process.stderr.write("Warning: quota nearly exhausted, retrying\\n");
      setTimeout(() => console.log(JSON.stringify({ t: "delta", v: "late" })), 500);`;
    const adapter = createCliAdapter(fakeCliSpec(script), { ...deps(), stallNoticeMs: 50 });
    const chunks = await collect(
      adapter.sendMessage({ model: "default", messages: [{ role: "user", content: "x" }] }),
    );
    expect(chunks).toEqual([
      { delta: "", done: false, notice: "quota nearly exhausted, retrying" },
      { delta: "late", done: false },
      { delta: "", done: true },
    ]);
  });

  it("rejects model ids that could be parsed as flags before spawning anything", async () => {
    const adapter = createCliAdapter(fakeCliSpec("process.exit(0)"), deps());
    await expect(
      collect(adapter.sendMessage({ model: "--yolo", messages: [{ role: "user", content: "x" }] })),
    ).rejects.toThrow("Unsupported model id");
  });

  it("explains a tool that is not installed", async () => {
    const adapter = createCliAdapter(fakeCliSpec(""), {
      ...deps(),
      resolveBinary: async () => undefined,
    });
    await expect(
      collect(
        adapter.sendMessage({ model: "default", messages: [{ role: "user", content: "x" }] }),
      ),
    ).rejects.toThrow("Fake CLI isn't installed on this computer.");
  });
});

// Plays a tool that keeps sessions: echoes the session it was given and its prompt, names its
// session "kept" (or "lost" for a prompt containing LOSE), and fails when told to resume "lost".
function sessionCliSpec(): CliToolSpec {
  const script = `
    const session = JSON.parse(process.argv[1]);
    if (session?.resume === "lost") { process.stderr.write("No conversation found\\n"); process.exit(1); }
    let input = "";
    process.stdin.on("data", (c) => (input += c));
    process.stdin.on("end", () => {
      console.log(JSON.stringify({ t: "delta", v: JSON.stringify(session) + "|" + input }));
      console.log(JSON.stringify({ t: "session", v: input.includes("LOSE") ? "lost" : "kept" }));
    });`;
  const spec = fakeCliSpec(script);
  return {
    ...spec,
    buildInvocation: (_model, { prompt }, session) => ({
      args: ["-e", script, JSON.stringify(session ?? null)],
      stdin: prompt,
    }),
    parseLine(line) {
      const event = parseJsonLine(line);
      return event?.["t"] === "session" ? { sessionId: String(event["v"]) } : spec.parseLine(line);
    },
  };
}

describe("a CLI that continues its own session", () => {
  const cwd = tmpdir();
  const turn = async (
    adapter: ReturnType<typeof createCliAdapter>,
    messages: ChatMessage[],
    ids: { turnId: string; resumeFrom?: string },
  ) => {
    const chunks = await collect(
      adapter.sendMessage({ model: "default", messages, conversationId: "pane-1", ...ids }),
    );
    return { chunks, text: chunks.map((chunk) => chunk.delta).join("") };
  };
  const first: ChatMessage[] = [{ role: "user", content: "one" }];
  const second = (reply: string, prompt = "two"): ChatMessage[] => [
    ...first,
    { role: "assistant", content: reply },
    { role: "user", content: prompt },
  ];

  it("sends only the new message when the window names the kept turn", async () => {
    const adapter = createCliAdapter(sessionCliSpec(), {
      resolveBinary: async () => process.execPath,
      childEnv: () => process.env,
      cwd,
      sessions: createAgentSessions(),
    });
    const one = await turn(adapter, first, { turnId: "t1" });
    expect(one.text).toBe("{}|one");

    const two = await turn(adapter, second(one.text), { turnId: "t2", resumeFrom: "t1" });
    expect(two.text).toBe('{"resume":"kept"}|two');
    expect(two.chunks.at(-1)).toEqual({ delta: "", done: true, resumed: true });

    // Retry, undo, restore: the window names no turn, so the whole transcript goes again.
    const three = await turn(adapter, second(one.text, "again"), { turnId: "t3" });
    expect(three.text).toMatch(/^\{\}\|Here is our conversation so far/);
  });

  it("sends the whole transcript in the same turn when resuming fails", async () => {
    const adapter = createCliAdapter(sessionCliSpec(), {
      resolveBinary: async () => process.execPath,
      childEnv: () => process.env,
      cwd,
      sessions: createAgentSessions(),
    });
    const one = await turn(adapter, [{ role: "user", content: "LOSE" }], { turnId: "t1" });
    const messages: ChatMessage[] = [
      { role: "user", content: "LOSE" },
      { role: "assistant", content: one.text },
      { role: "user", content: "two" },
    ];
    const two = await turn(adapter, messages, { turnId: "t2", resumeFrom: "t1" });
    expect(two.text).toMatch(/^\{\}\|Here is our conversation so far/);
    expect(two.chunks.at(-1)).toEqual({ delta: "", done: true });
  });

  it("gives a tool without sessions the whole transcript every turn", async () => {
    const adapter = createCliAdapter(sessionCliSpec(), {
      resolveBinary: async () => process.execPath,
      childEnv: () => process.env,
      cwd,
    });
    const one = await turn(adapter, first, { turnId: "t1" });
    expect(one.text).toBe("null|one");
    const two = await turn(adapter, second(one.text), { turnId: "t2", resumeFrom: "t1" });
    expect(two.text).toMatch(/^null\|Here is our conversation so far/);
  });
});
