import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCliAdapter, parseJsonLine, type CliToolSpec } from "../../src/main/cli/cli-adapter";
import type { ChatChunk } from "../../src/shared/types";

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
