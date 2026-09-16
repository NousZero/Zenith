import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CredentialStore } from "../../src/main/credential-store";
import { createCustomProviderStore, customAdapter } from "../../src/main/custom-providers";
import type { ChatChunk } from "../../src/shared/types";

function memoryCredentials(): CredentialStore {
  const secrets = new Map<string, string>();
  return {
    get: async (id) => secrets.get(id),
    set: async (id, secret) => void secrets.set(id, secret),
    delete: async (id) => void secrets.delete(id),
    list: async () => [...secrets.keys()],
  };
}

describe("custom providers", () => {
  let dir: string;
  let server: Server | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-providers-"));
  });

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    server = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it("saves, edits, and removes providers while keeping keys out of the file", async () => {
    const credentials = memoryCredentials();
    const store = createCustomProviderStore(join(dir, "providers.json"), credentials);
    const [groq] = await store.save({
      name: "Groq",
      api: "openai",
      baseUrl: "https://api.groq.com/openai/v1/",
      models: ["llama-3.3-70b", " ", "llama-3.3-70b"],
      apiKey: "gsk-secret",
    });
    expect(groq).toEqual({
      id: "custom:groq",
      name: "Groq",
      api: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      models: ["llama-3.3-70b"],
      hasKey: true,
    });
    const second = await store.save({
      name: "Groq",
      api: "openai",
      baseUrl: "https://x.test/v1",
      models: [],
      apiKey: "",
    });
    expect(second.map((provider) => provider.id)).toEqual(["custom:groq", "custom:groq-2"]);
    expect(second[1]?.hasKey).toBe(false);

    // An empty key keeps the saved one; null removes it.
    const edited = await store.save({
      id: "custom:groq",
      name: "Groq Cloud",
      api: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      models: [],
      apiKey: "",
    });
    expect(edited[0]).toMatchObject({ name: "Groq Cloud", hasKey: true });
    expect(await credentials.get("custom:groq")).toBe("gsk-secret");
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(join(dir, "providers.json"), "utf8")).not.toContain("gsk-secret");
    await store.save({
      id: "custom:groq",
      name: "Groq Cloud",
      api: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      models: [],
      apiKey: null,
    });
    expect(await credentials.get("custom:groq")).toBeUndefined();

    await expect(
      store.save({
        name: "Bad",
        api: "openai",
        baseUrl: "http://api.example.com",
        models: [],
        apiKey: "k",
      }),
    ).rejects.toThrow("https://");
    expect((await store.remove("custom:groq-2")).map((provider) => provider.id)).toEqual([
      "custom:groq",
    ]);
  });

  it("chats and lists models through an OpenAI-compatible address with the saved key", async () => {
    const seen: { path: string; auth: string; body: string }[] = [];
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk.toString()));
      request.on("end", () => {
        seen.push({ path: request.url ?? "", auth: request.headers.authorization ?? "", body });
        if (request.url === "/v1/models") {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ data: [{ id: "zeta" }, { id: "alpha" }] }));
          return;
        }
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`);
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n`);
        response.write(
          `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2 } })}\n\n`,
        );
        response.end("data: [DONE]\n\n");
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    const credentials = memoryCredentials();
    await credentials.set("custom:local", "sk-local");
    const adapter = customAdapter(
      { id: "custom:local", name: "Local", api: "openai", baseUrl, models: [] },
      credentials,
    );

    expect((await adapter.listModels()).map((model) => model.id)).toEqual(["alpha", "zeta"]);
    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.sendMessage({
      model: "alpha",
      messages: [{ role: "user", content: "Hi" }],
    })) {
      chunks.push(chunk);
    }
    expect(chunks.map((chunk) => chunk.delta).join("")).toBe("Hello");
    expect(chunks.at(-1)).toEqual({
      delta: "",
      done: true,
      usage: { inputTokens: 7, outputTokens: 2 },
    });
    expect(seen.every((request) => request.auth === "Bearer sk-local")).toBe(true);
    // Plain chats send no tools list, which some servers reject when empty.
    expect(JSON.parse(seen.at(-1)?.body ?? "{}")).not.toHaveProperty("tools");
  });
});
