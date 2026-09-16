import { mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCliAdapter } from "../../src/main/cli/cli-adapter";
import { childProcessPath, resolveExecutable } from "../../src/main/cli/resolve-executable";
import { claudeCodeSpec } from "../../src/main/providers/claude-code";
import { createLocalServerAdapter, fetchLocalModels } from "../../src/main/providers/local-server";
import type { ChatChunk } from "../../src/shared/types";

// Opt-in: talks to real installed tools and uses real account quota.
// Run with ZENITH_LIVE=1 npx vitest run --project integration tests/integration/live-connections.test.ts
const live = process.env["ZENITH_LIVE"] === "1";

const environment = { env: process.env, home: homedir(), platform: process.platform };

async function collect(iterable: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

describe.skipIf(!live)("live connections", () => {
  let sandbox: string;

  beforeAll(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "zenith-live-"));
  });

  afterAll(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("gets a streamed reply from Claude Code without touching the sandbox", async () => {
    const binary = await resolveExecutable("claude", environment);
    expect(binary, "claude must be installed for this live test").toBeDefined();
    const adapter = createCliAdapter(claudeCodeSpec, {
      resolveBinary: async () => binary,
      childEnv: (path) => ({ ...process.env, PATH: childProcessPath(path, environment) }),
      cwd: sandbox,
    });
    const chunks = await collect(
      adapter.sendMessage({
        model: "haiku",
        messages: [
          { role: "system", content: "Answer with a single lowercase word." },
          { role: "user", content: "What color is a clear daytime sky?" },
        ],
      }),
    );
    const text = chunks.map((chunk) => chunk.delta).join("");
    const final = chunks.at(-1);
    expect(text.toLowerCase()).toContain("blue");
    expect(final?.done).toBe(true);
    expect(final?.usage?.outputTokens).toBeGreaterThan(0);
    expect(await readdir(sandbox)).toEqual([]);
  }, 120_000);

  it("gets a streamed reply from a running Ollama server", async () => {
    const baseUrl = "http://127.0.0.1:11434";
    const models = await fetchLocalModels(baseUrl);
    const model = models[0];
    expect(model, "Ollama must be running with at least one model").toBeDefined();
    const adapter = createLocalServerAdapter({
      id: "ollama",
      label: "Ollama",
      baseUrl,
      startHint: "",
    });
    const chunks = await collect(
      adapter.sendMessage({
        model: model?.id ?? "",
        messages: [{ role: "user", content: "Reply with exactly: pong" }],
      }),
    );
    expect(
      chunks
        .map((chunk) => chunk.delta)
        .join("")
        .toLowerCase(),
    ).toContain("pong");
    expect(chunks.at(-1)?.usage?.outputTokens).toBeGreaterThan(0);
  }, 180_000);
});
