import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../src/main/database";
import { createSemanticIndex, mergeExcerpts, type Embedder } from "../../src/main/semantic-index";
import { createSessionStore } from "../../src/main/session-store";

// A toy embedder: one dimension per topic word, so "pup" lands near "dog".
const TOPICS = [
  ["dog", "puppy", "pup", "biscuit"],
  ["tax", "invoice", "accountant"],
  ["rust", "cargo", "compiler"],
];
const toyEmbedder: Embedder = async (_model, texts) =>
  texts.map((text) =>
    TOPICS.map((words) => words.filter((word) => text.toLowerCase().includes(word)).length),
  );

describe("semantic index", () => {
  let dir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-semantic-"));
    db = openDatabase(join(dir, "zenith.db"));
    await createSessionStore(db).save({
      id: "s1",
      name: "Life",
      memoryText: "",
      personalityId: "",
      updatedAt: 1,
      panes: [
        {
          id: "p1",
          name: "Pane A",
          providerId: "ollama",
          modelId: "m",
          included: true,
          memoryEnabled: false,
          messages: [
            { id: "m1", role: "user", content: "My puppy is named Biscuit and loves walks." },
            { id: "m2", role: "user", content: "Remind me to send the invoice to my accountant." },
            { id: "m3", role: "assistant", content: "Cargo builds Rust crates with the compiler." },
            { id: "m4", role: "user", content: "short" },
          ],
          promptTokens: 0,
          completionTokens: 0,
          lastError: null,
          contextWindow: null,
          projectPath: null,
          agentPath: null,
          planMode: false,
        },
      ],
    });
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("stays off until a model is set, then finds messages by meaning", async () => {
    const index = createSemanticIndex(db, toyEmbedder);
    expect(index.status()).toEqual({ model: "", indexed: 0, total: 3 });
    expect(await index.search("what is my pup called?", 2)).toEqual([]);

    await index.setModel("toy");
    const results = await index.search("what is my pup called?", 1);
    expect(results.map((result) => result.content)).toEqual([
      "My puppy is named Biscuit and loves walks.",
    ]);
    expect(index.status()).toEqual({ model: "toy", indexed: 3, total: 3 });

    await index.setModel("");
    expect(index.status().model).toBe("");
  });

  it("rejects a model that can't embed and merges results without repeats", async () => {
    const failing = createSemanticIndex(db, async () => {
      throw new Error('model "missing" not found, try pulling it first');
    });
    await expect(failing.setModel("missing")).rejects.toThrow("not found");
    expect(failing.status().model).toBe("");

    const a = { sessionName: "S", paneName: "P", role: "user" as const, content: "a" };
    const b = { ...a, content: "b" };
    expect(mergeExcerpts([a], [a, b], 5)).toEqual([a, b]);
  });
});
