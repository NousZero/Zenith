import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAttachmentStore, MAX_IMAGE_BYTES } from "../../src/main/attachments";
import { openDatabase } from "../../src/main/database";
import { anthropicContent, openAiContent } from "../../src/main/providers/content";
import { claudeCodeSpec } from "../../src/main/providers/claude-code";
import { createSessionStore } from "../../src/main/session-store";
import { buildFanOutMessages } from "../../src/shared/fan-out";
import { takesImages } from "../../src/shared/images";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString("base64");

describe("pasted images", () => {
  let dir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-images-"));
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("stores images by content and refuses the wrong type, size, or name", async () => {
    const store = createAttachmentStore(join(dir, "attachments"));
    const first = await store.save("image/png", PNG);
    expect(first.id).toMatch(/^[0-9a-f]{64}\.png$/);
    expect(await store.save("image/png", PNG)).toEqual(first);
    expect(await store.read(first.id)).toEqual({ ...first, data: PNG });

    await expect(store.save("image/svg+xml", PNG)).rejects.toThrow("PNG, JPEG, GIF, and WebP");
    await expect(store.save("image/png", "")).rejects.toThrow("empty");
    const huge = Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64");
    await expect(store.save("image/png", huge)).rejects.toThrow("5 MB");
    // Only names the store made itself can be read, so a path can't escape the folder.
    await expect(store.read("../zenith.db")).rejects.toThrow("Unknown attachment");
  });

  it("keeps image references with the message across saves", async () => {
    const sessions = createSessionStore(db);
    const image = { id: `${"a".repeat(64)}.png`, mediaType: "image/png" };
    await sessions.save({
      id: "s1",
      name: "Screenshots",
      memoryText: "",
      personalityId: "",
      updatedAt: 0,
      panes: [
        {
          id: "p1",
          name: "Pane",
          providerId: "anthropic",
          modelId: "claude-opus-5",
          included: true,
          messages: [
            { id: "m1", role: "user", content: "What is this?", images: [image] },
            { id: "m2", role: "assistant", content: "A chart." },
          ],
          promptTokens: 0,
          completionTokens: 0,
          lastError: null,
          memoryEnabled: false,
          projectPath: null,
          agentPath: null,
          planMode: false,
          contextWindow: null,
        },
      ],
    });
    const loaded = await sessions.load("s1");
    expect(loaded?.panes[0]?.messages).toEqual([
      { id: "m1", role: "user", content: "What is this?", images: [image] },
      { id: "m2", role: "assistant", content: "A chart." },
    ]);
  });

  it("shapes image content for each API and only sends loaded data", () => {
    const message = {
      role: "user" as const,
      content: "Explain",
      images: [{ id: "x.png", mediaType: "image/png", data: PNG }],
    };
    expect(openAiContent(message)).toEqual([
      { type: "text", text: "Explain" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
    ]);
    expect(anthropicContent(message)).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
      { type: "text", text: "Explain" },
    ]);
    // A reference without data (as the window holds it) stays plain text.
    expect(openAiContent({ ...message, images: [{ id: "x.png", mediaType: "image/png" }] })).toBe(
      "Explain",
    );

    const invocation = claudeCodeSpec.buildInvocation("haiku", {
      system: undefined,
      prompt: "Explain",
      images: message.images,
    });
    expect(invocation.args).toContain("--input-format");
    const line = JSON.parse(invocation.stdin) as { message: { content: unknown[] } };
    expect(line.message.content[0]).toMatchObject({ type: "image" });
    expect(claudeCodeSpec.buildInvocation("haiku", { system: undefined, prompt: "Hi" }).stdin).toBe(
      "Hi",
    );
  });

  it("carries references through the outgoing messages and knows which connections read them", () => {
    const image = { id: "y.png", mediaType: "image/png" };
    const messages = buildFanOutMessages(
      {
        id: "p",
        name: "Pane",
        providerId: "ollama",
        modelId: "llava",
        included: true,
        messages: [{ id: "a", role: "user", content: "Before", images: [image] }],
        promptTokens: 0,
        completionTokens: 0,
        lastError: null,
        memoryEnabled: false,
        projectPath: null,
        agentPath: null,
        planMode: false,
        contextWindow: null,
      },
      "And this?",
      "",
      "",
      [image],
    );
    expect(messages).toEqual([
      { role: "user", content: "Before", images: [image] },
      { role: "user", content: "And this?", images: [image] },
    ]);
    expect(takesImages("claude-code")).toBe(true);
    expect(takesImages("custom:groq")).toBe(true);
    expect(takesImages("hermes")).toBe(false);
    expect(takesImages("gemini-cli")).toBe(false);
  });
});
