import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../src/main/database";
import { createSessionStore, importLegacyJsonSessions } from "../../src/main/session-store";
import type { PaneState, SessionState } from "../../src/shared/types";

function makePane(overrides: Partial<PaneState> = {}): PaneState {
  return {
    id: "pane-1",
    name: "Pane 1",
    providerId: "claude-code",
    modelId: "default",
    included: true,
    memoryEnabled: false,
    messages: [],
    promptTokens: 0,
    completionTokens: 0,
    lastError: null,
    contextWindow: null,
    projectPath: null,
    agentPath: null,
    planMode: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: "session-1",
    name: "First session",
    memoryText: "",
    personalityId: "",
    panes: [],
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("SQLite session store", () => {
  let dir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-sessions-"));
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a session with ordered panes and messages", async () => {
    const store = createSessionStore(db);
    const session = makeSession({
      memoryText: "remember",
      personalityId: "teacher",
      panes: [
        makePane({
          id: "b",
          name: "Second",
          included: false,
          memoryEnabled: true,
          promptTokens: 12,
          completionTokens: 34,
          lastError: "boom",
          messages: [
            { id: "m1", role: "user", content: "hi" },
            { id: "m2", role: "assistant", content: "hello" },
          ],
        }),
        makePane({ id: "a", name: "First" }),
      ],
    });
    await store.save(session);
    await expect(store.load("session-1")).resolves.toEqual(session);
  });

  it("links each message to the previous one", async () => {
    const store = createSessionStore(db);
    await store.save(
      makeSession({
        panes: [
          makePane({
            messages: [
              { id: "m1", role: "user", content: "hi" },
              { id: "m2", role: "assistant", content: "hello" },
            ],
          }),
        ],
      }),
    );
    const rows = db.prepare("SELECT id, parent_id FROM messages ORDER BY position").all();
    expect(rows).toEqual([
      { id: "m1", parent_id: null },
      { id: "m2", parent_id: "m1" },
    ]);
  });

  it("removes panes and messages that are no longer present", async () => {
    const store = createSessionStore(db);
    await store.save(
      makeSession({
        panes: [
          makePane({
            id: "keep",
            messages: [
              { id: "m1", role: "user", content: "hi" },
              { id: "m2", role: "assistant", content: "hello" },
            ],
          }),
          makePane({ id: "drop", messages: [{ id: "m3", role: "user", content: "x" }] }),
        ],
      }),
    );
    const trimmed = makeSession({
      panes: [makePane({ id: "keep", messages: [{ id: "m1", role: "user", content: "hi" }] })],
    });
    await store.save(trimmed);
    await expect(store.load("session-1")).resolves.toEqual(trimmed);
    expect(db.prepare("SELECT count(*) AS n FROM messages").get()).toEqual({ n: 1 });
  });

  it("returns undefined for a session that does not exist", async () => {
    await expect(createSessionStore(db).load("missing")).resolves.toBeUndefined();
  });

  it("lists sessions newest-first by updatedAt", async () => {
    const store = createSessionStore(db);
    await store.save(makeSession({ id: "old", name: "Old", updatedAt: 1 }));
    await store.save(makeSession({ id: "new", name: "New", updatedAt: 2 }));
    await expect(store.list()).resolves.toEqual([
      { id: "new", name: "New", updatedAt: 2 },
      { id: "old", name: "Old", updatedAt: 1 },
    ]);
  });

  it("cascades a session delete to its panes and messages", async () => {
    const store = createSessionStore(db);
    await store.save(
      makeSession({
        panes: [makePane({ messages: [{ id: "m1", role: "user", content: "hi" }] })],
      }),
    );
    await store.delete("session-1");
    await expect(store.list()).resolves.toEqual([]);
    expect(db.prepare("SELECT count(*) AS n FROM panes").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM messages").get()).toEqual({ n: 0 });
  });

  it("reopens an existing database without re-running migrations", async () => {
    await createSessionStore(db).save(makeSession());
    db.close();
    db = openDatabase(join(dir, "zenith.db"));
    await expect(createSessionStore(db).list()).resolves.toHaveLength(1);
  });

  it("imports legacy JSON sessions, assigns message ids, and keeps a backup", async () => {
    const sessionsDir = join(dir, "sessions");
    await mkdir(sessionsDir);
    const legacy = {
      ...makeSession({ id: "legacy" }),
      panes: [{ ...makePane(), messages: [{ role: "user", content: "old" }] }],
    };
    await writeFile(join(sessionsDir, "legacy.json"), JSON.stringify(legacy));
    await writeFile(join(sessionsDir, "broken.json"), "{not json");

    const store = createSessionStore(db);
    const result = await importLegacyJsonSessions(store, sessionsDir);

    expect(result).toEqual({ imported: 1, backupDir: `${sessionsDir}-json-backup` });
    expect(existsSync(sessionsDir)).toBe(false);
    expect(await readdir(`${sessionsDir}-json-backup`)).toHaveLength(2);
    const loaded = await store.load("legacy");
    expect(loaded?.panes[0]?.messages).toEqual([
      { id: expect.any(String), role: "user", content: "old" },
    ]);
  });
});
