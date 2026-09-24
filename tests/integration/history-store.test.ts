import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../src/main/database";
import { createHistoryStore } from "../../src/main/history-store";
import { createSessionStore } from "../../src/main/session-store";
import { HIT_END, HIT_START, sharesKeywords } from "../../src/shared/history";
import type { PaneMessage, SessionState } from "../../src/shared/types";

function session(id: string, name: string, messages: PaneMessage[]): SessionState {
  return {
    id,
    name,
    memoryText: "",
    personalityId: "",
    updatedAt: 1,
    panes: [
      {
        id: `${id}-pane`,
        name: "Pane A",
        providerId: "claude-code",
        modelId: "default",
        included: true,
        memoryEnabled: false,
        messages,
        promptTokens: 0,
        completionTokens: 0,
        lastError: null,
        contextWindow: null,
        projectPath: null,
        agentPath: null,
        planMode: false,
      },
    ],
  };
}

describe("history store", () => {
  let dir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-history-"));
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("finds messages across sessions with highlighted snippets", async () => {
    const sessions = createSessionStore(db);
    await sessions.save(
      session("s1", "Database work", [
        { id: "m1", role: "user", content: "How does SQLite WAL mode work?" },
        { id: "m2", role: "assistant", content: "WAL writes changes to a separate log first." },
      ]),
    );
    await sessions.save(
      session("s2", "Cooking", [{ id: "m3", role: "user", content: "A recipe for café crème" }]),
    );
    const history = createHistoryStore(db);

    const results = history.search("wal");
    expect(results.map((result) => result.messageId).sort()).toEqual(["m1", "m2"]);
    expect(results[0]?.sessionName).toBe("Database work");
    expect(results[0]?.snippet).toContain(`${HIT_START}WAL${HIT_END}`);
    // Prefix and accent-insensitive matching, and FTS syntax in input is harmless.
    expect(history.search("cafe").map((result) => result.messageId)).toEqual(["m3"]);
    expect(history.search('recipe" OR "wal')).toHaveLength(0);
    expect(history.search("  ")).toEqual([]);
  });

  it("keeps the index in sync when messages change or sessions are deleted", async () => {
    const sessions = createSessionStore(db);
    const history = createHistoryStore(db);
    await sessions.save(session("s1", "One", [{ id: "m1", role: "user", content: "old words" }]));
    await sessions.save(session("s1", "One", [{ id: "m1", role: "user", content: "new words" }]));
    expect(history.search("old")).toEqual([]);
    expect(history.search("new")).toHaveLength(1);
    await sessions.delete("s1");
    expect(history.search("new")).toEqual([]);
  });

  it("retrieves excerpts matching any meaningful word of a question", async () => {
    const sessions = createSessionStore(db, () => 5);
    await sessions.save(
      session("s1", "Pets", [
        { id: "m1", role: "user", content: "My dog is called Biscuit." },
        { id: "m2", role: "user", content: "Unrelated note about taxes." },
      ]),
    );
    const excerpts = createHistoryStore(db).retrieve("What is the name of my dog?");
    expect(excerpts).toEqual([
      {
        sessionName: "Pets",
        paneName: "Pane A",
        role: "user",
        content: "My dog is called Biscuit.",
        at: 5,
      },
    ]);
  });

  it("recalls from other sessions only, and keeps each session's recall switch", async () => {
    const sessions = createSessionStore(db);
    await sessions.save({
      ...session("current", "Deploys today", [
        { id: "m1", role: "user", content: "Which deploy bucket do we use?" },
      ]),
      recallPastSessions: true,
    });
    await sessions.save(
      session("past", "Release notes", [
        { id: "m2", role: "user", content: "Our deploy bucket is named quokka-lantern-7." },
        { id: "m3", role: "user", content: "The deploy went fine." },
      ]),
    );
    const history = createHistoryStore(db);
    const prompt = "Which deploy bucket should I use?";

    const recalled = history
      .retrieve(prompt, "current")
      .filter((excerpt) => sharesKeywords(prompt, excerpt.content));
    expect(recalled.map((excerpt) => [excerpt.sessionName, excerpt.content])).toEqual([
      ["Release notes", "Our deploy bucket is named quokka-lantern-7."],
    ]);
    // Without a session to leave out, as Ask uses it, the current session is searched too.
    expect(history.retrieve(prompt).map((excerpt) => excerpt.sessionName)).toContain(
      "Deploys today",
    );

    expect((await sessions.load("current"))?.recallPastSessions).toBe(true);
    expect((await sessions.load("past"))?.recallPastSessions).toBeUndefined();
  });

  it("summarizes recorded usage by connection and day", () => {
    let clock = Date.parse("2026-09-10T12:00:00");
    const history = createHistoryStore(db, () => clock);
    const record = { sessionId: "s1", paneId: "p1", modelId: "default", estimated: false };
    history.recordUsage({
      ...record,
      providerId: "claude-code",
      inputTokens: 100,
      outputTokens: 20,
    });
    clock = Date.parse("2026-09-11T12:00:00");
    history.recordUsage({
      ...record,
      providerId: "claude-code",
      inputTokens: 50,
      outputTokens: 10,
    });
    history.recordUsage({
      ...record,
      sessionId: "s2",
      providerId: "ollama",
      modelId: "llama3",
      inputTokens: 5,
      outputTokens: 5,
      estimated: true,
    });

    const all = history.insights(0);
    expect(all).toMatchObject({
      turns: 3,
      inputTokens: 155,
      outputTokens: 35,
      estimatedTurns: 1,
      sessions: 2,
    });
    expect(all.byConnection[0]).toEqual({
      providerId: "claude-code",
      modelId: "default",
      turns: 2,
      inputTokens: 150,
      outputTokens: 30,
    });
    expect(all.byDay).toEqual([
      { day: "2026-09-10", turns: 1, tokens: 120 },
      { day: "2026-09-11", turns: 2, tokens: 70 },
    ]);
    expect(history.insights(Date.parse("2026-09-11T00:00:00")).turns).toBe(2);
  });
});
