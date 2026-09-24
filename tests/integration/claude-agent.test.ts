import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runClaudeAgent } from "../../src/main/agent/claude-agent";
import { openDatabase } from "../../src/main/database";
import { parsePermissionRules } from "../../src/shared/permissions";
import { createProjectStore } from "../../src/main/project-store";
import type { ChatChunk, PermissionPrompt } from "../../src/shared/types";
import { launchable } from "../fixtures/windows-shim";

const fakeClaude = launchable(join(import.meta.dirname, "..", "fixtures", "fake-claude-agent.mjs"));

describe("Claude Code agent mode", () => {
  let dir: string;
  let project: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-agent-"));
    project = join(dir, "project");
    await rm(project, { recursive: true, force: true });
    await import("node:fs/promises").then((fs) => fs.mkdir(project));
    await writeFile(join(project, "notes.txt"), "alpha\n");
    await chmod(fakeClaude, 0o755);
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function run(
    choice: string | undefined,
    rules = "",
    sandboxSettings?: string,
    stallMs?: number,
  ) {
    const store = createProjectStore(db);
    const prompts: PermissionPrompt[] = [];
    const chunks: ChatChunk[] = [];
    for await (const chunk of runClaudeAgent(
      {
        model: "default",
        messages: [{ role: "user", content: "append beta" }],
        projectPath: project,
        turnId: "turn-1",
        requestPermission: async (prompt) => {
          prompts.push(prompt);
          return choice;
        },
      },
      {
        resolveBinary: async () => fakeClaude,
        childEnv: () => ({
          PATH: process.env["PATH"] ?? "",
          FAKE_CLAUDE_ARGS_FILE: join(dir, "args.json"),
          ...(stallMs ? { FAKE_CLAUDE_STALL_MS: String(stallMs) } : {}),
        }),
        saveCheckpoint: store.saveCheckpoint,
        syncTodos: store.syncTodos,
        mcpConfigPath: async () => undefined,
        permissionRules: () => parsePermissionRules(rules),
        sandboxSettings: async () => sandboxSettings,
        stallNoticeMs: 50,
      },
    )) {
      chunks.push(chunk);
    }
    return { store, prompts, chunks };
  }

  it("asks with a diff, checkpoints the file, streams activity, and can roll back", async () => {
    const { store, prompts, chunks } = await run("allow");

    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.title).toBe("Edit notes.txt");
    expect(prompts[0]?.diff).toBe(
      ["--- notes.txt", "+++ notes.txt", "@@ -1,1 +1,2 @@", " alpha", "+beta"].join("\n"),
    );
    expect(await readFile(join(project, "notes.txt"), "utf8")).toBe("alpha\nbeta\n");

    const statuses = chunks.flatMap((chunk) =>
      chunk.activity?.id === "tool-1" ? [chunk.activity.status] : [],
    );
    expect(statuses).toEqual(["running", "awaiting-approval", "running", "done"]);
    expect(chunks.find((chunk) => chunk.activity?.checkpoint)).toBeDefined();
    expect(chunks.find((chunk) => chunk.todos)?.todos).toEqual([
      { content: "Append beta", status: "completed" },
    ]);
    expect(chunks.map((chunk) => chunk.delta).join("")).toBe("Edited.");
    expect(chunks.at(-1)).toEqual({
      delta: "",
      done: true,
      usage: { inputTokens: 40, outputTokens: 8 },
      contextWindow: 200000,
    });
    expect(store.listCards(project).map(({ title, status }) => ({ title, status }))).toEqual([
      { title: "Append beta", status: "done" },
    ]);

    expect(await store.rollback("turn-1")).toHaveLength(1);
    expect(await readFile(join(project, "notes.txt"), "utf8")).toBe("alpha\n");
  });

  it("denies the action when the user denies it", async () => {
    const { chunks } = await run("deny");
    expect(await readFile(join(project, "notes.txt"), "utf8")).toBe("alpha\n");
    const last = chunks.filter((chunk) => chunk.activity?.id === "tool-1").at(-1);
    expect(last?.activity?.status).toBe("denied");
    expect(chunks.map((chunk) => chunk.delta).join("")).toBe("Could not edit.");
  });

  it("passes Claude Code its sandbox settings only when sandboxing is on", async () => {
    await run("allow");
    const plain = JSON.parse(await readFile(join(dir, "args.json"), "utf8")) as string[];
    expect(plain).not.toContain("--settings");

    await writeFile(join(project, "notes.txt"), "alpha\n");
    await run("allow", "", '{"sandbox":{"enabled":true}}');
    const sandboxed = JSON.parse(await readFile(join(dir, "args.json"), "utf8")) as string[];
    expect(sandboxed[sandboxed.indexOf("--settings") + 1]).toBe('{"sandbox":{"enabled":true}}');
  });

  it("shows Claude Code's latest warning once while it is silent, then carries on", async () => {
    const { chunks } = await run("allow", "", undefined, 500);
    const notices = chunks.flatMap((chunk) => (chunk.notice ? [chunk.notice] : []));
    // Several quiet spells pass, but the same warning is shown only once.
    expect(notices).toEqual(["API rate limited (429); retrying in 30s"]);
    expect(chunks.findIndex((chunk) => chunk.notice)).toBeLessThan(
      chunks.findIndex((chunk) => chunk.activity),
    );
    expect(chunks.map((chunk) => chunk.delta).join("")).toBe("Edited.");
    expect(await readFile(join(project, "notes.txt"), "utf8")).toBe("alpha\nbeta\n");
  });

  it("follows permission rules without asking", async () => {
    const allowed = await run(undefined, "allow Edit notes.txt");
    expect(allowed.prompts).toHaveLength(0);
    expect(await readFile(join(project, "notes.txt"), "utf8")).toBe("alpha\nbeta\n");

    await writeFile(join(project, "notes.txt"), "alpha\n");
    const denied = await run("allow", "allow Edit *\ndeny Edit notes.*");
    expect(denied.prompts).toHaveLength(0);
    expect(await readFile(join(project, "notes.txt"), "utf8")).toBe("alpha\n");
  });
});

describe("project store", () => {
  let dir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-project-"));
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("rolls back a created file by deleting it and keeps the first snapshot per file", async () => {
    const store = createProjectStore(db);
    const created = join(dir, "new.txt");
    const edited = join(dir, "edited.txt");
    await writeFile(edited, "v1");
    await store.saveCheckpoint("t", dir, created);
    await store.saveCheckpoint("t", dir, edited);
    await writeFile(created, "made by agent");
    await writeFile(edited, "v2");
    await store.saveCheckpoint("t", dir, edited);
    await writeFile(edited, "v3");

    await store.rollback("t");
    await expect(readFile(created, "utf8")).rejects.toThrow();
    expect(await readFile(edited, "utf8")).toBe("v1");
    await expect(store.rollback("t")).resolves.toEqual([]);
  });

  it("rolls back one file at a time, and forgets it for later rollbacks", async () => {
    const store = createProjectStore(db);
    const created = join(dir, "new.txt");
    const edited = join(dir, "edited.txt");
    await writeFile(edited, "v1");
    await store.saveCheckpoint("t", dir, created);
    await store.saveCheckpoint("t", dir, edited);
    await writeFile(created, "made by agent");
    await writeFile(edited, "v2");

    expect(await store.rollbackFile("t", edited)).toBe(true);
    expect(await readFile(edited, "utf8")).toBe("v1");
    await expect(readFile(created, "utf8")).resolves.toBe("made by agent");

    // Already used, so a second call finds nothing and a whole-turn rollback leaves it alone.
    expect(await store.rollbackFile("t", edited)).toBe(false);
    expect(await store.rollbackFile("t", created)).toBe(true);
    await expect(readFile(created, "utf8")).rejects.toThrow();
    expect(await store.rollback("t")).toEqual([]);
  });

  it("moves synced cards as todo statuses change and lets users manage cards", () => {
    const store = createProjectStore(db);
    store.syncTodos("/p", [{ content: "Task", status: "pending" }]);
    store.syncTodos("/p", [{ content: "Task", status: "in_progress" }]);
    const [card] = store.listCards("/p");
    expect(card).toMatchObject({ title: "Task", status: "doing" });
    const saved = store.saveCard({ projectPath: "/p", title: "Mine", status: "todo" });
    expect(saved.map((item) => item.title)).toEqual(["Task", "Mine"]);
    expect(store.deleteCard(card?.id ?? "", "/p").map((item) => item.title)).toEqual(["Mine"]);
    expect(store.listCards("/other")).toEqual([]);
  });
});
