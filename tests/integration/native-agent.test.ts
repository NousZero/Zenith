import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { escapesProject } from "../../src/main/agent/claude-agent";
import { anthropicModel, openAiCompatibleModel, type ToolModel } from "../../src/main/agent/models";
import {
  nativeToolNames,
  runNativeAgent,
  type NativeAgentDeps,
} from "../../src/main/agent/native-agent";
import { parsePermissionRules } from "../../src/shared/permissions";
import { openDatabase } from "../../src/main/database";
import { createProjectStore } from "../../src/main/project-store";
import type { ChatChunk, PermissionPrompt } from "../../src/shared/types";

type Script = (body: Record<string, unknown>) => string[];

// Serves one scripted SSE response per request, in order, and records request bodies.
async function fakeServer(responses: Script[]) {
  const requests: Record<string, unknown>[] = [];
  const server: Server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    request.on("end", () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      requests.push(body);
      const script = responses[requests.length - 1];
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const event of script ? script(body) : []) response.write(`data: ${event}\n\n`);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

const openAiText = (text: string) => [
  JSON.stringify({ choices: [{ delta: { content: text } }] }),
  JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
  "[DONE]",
];

const openAiTools = (...calls: { name: string; args: Record<string, unknown> }[]) => [
  ...calls.map((call, index) =>
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index,
                id: `call-${call.name}-${index}`,
                function: { name: call.name, arguments: "" },
              },
            ],
          },
        },
      ],
    }),
  ),
  // Arguments arrive in pieces, as real streams send them.
  ...calls.flatMap((call, index) => {
    const json = JSON.stringify(call.args);
    const middle = Math.floor(json.length / 2);
    return [json.slice(0, middle), json.slice(middle)].map((part) =>
      JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index, function: { arguments: part } }] } }],
      }),
    );
  }),
  JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
  "[DONE]",
];

describe("native agent loop", () => {
  let dir: string;
  let project: string;
  let db: DatabaseSync;
  let closeServer: (() => Promise<unknown>) | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-native-"));
    project = join(dir, "project");
    await mkdir(project);
    await writeFile(join(project, "notes.txt"), "alpha\n");
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    await closeServer?.();
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function run(
    model: ToolModel,
    choice: (prompt: PermissionPrompt) => string,
    planMode = false,
    extraDeps: Partial<NativeAgentDeps> = {},
  ) {
    const store = createProjectStore(db);
    const prompts: PermissionPrompt[] = [];
    const chunks: ChatChunk[] = [];
    for await (const chunk of runNativeAgent(
      {
        model: "test-model",
        messages: [
          { role: "system", content: "Be careful." },
          { role: "user", content: "Append beta" },
        ],
        projectPath: project,
        turnId: "turn-1",
        planMode,
        requestPermission: async (prompt) => {
          prompts.push(prompt);
          return choice(prompt);
        },
      },
      {
        model,
        childEnv: { PATH: process.env["PATH"] ?? "" },
        saveCheckpoint: store.saveCheckpoint,
        syncTodos: store.syncTodos,
        profilePath: join(dir, "USER.md"),
        ...extraDeps,
      },
    )) {
      chunks.push(chunk);
    }
    return { store, prompts, chunks };
  }

  it("reads, edits with approval, delegates to a subagent, and finishes", async () => {
    const server = await fakeServer([
      () => [
        JSON.stringify({ choices: [{ delta: { content: "Looking." } }] }),
        ...openAiTools(
          {
            name: "TodoWrite",
            args: { todos: [{ content: "Append beta", status: "in_progress" }] },
          },
          { name: "Read", args: { file_path: "notes.txt" } },
        ),
      ],
      () =>
        openAiTools({
          name: "Edit",
          args: { file_path: "notes.txt", old_string: "alpha\n", new_string: "alpha\nbeta\n" },
        }),
      () =>
        openAiTools({
          name: "Task",
          args: { description: "List files", prompt: "List the files." },
        }),
      () => openAiTools({ name: "Glob", args: { pattern: "*" } }),
      () => openAiText("Found notes.txt."),
      () => openAiText("All done."),
    ]);
    closeServer = server.close;
    const model = openAiCompatibleModel({
      label: "Test",
      baseUrl: server.url,
      headers: async () => ({}),
    });

    const { store, prompts, chunks } = await run(model, () => "allow");

    expect(await readFile(join(project, "notes.txt"), "utf8")).toBe("alpha\nbeta\n");
    expect(prompts.map((prompt) => prompt.title)).toEqual(["Edit notes.txt"]);
    expect(prompts[0]?.diff).toContain("+beta");
    expect(chunks.map((chunk) => chunk.delta).join("")).toBe("Looking.\n\nAll done.");
    expect(chunks.find((chunk) => chunk.todos)?.todos).toEqual([
      { content: "Append beta", status: "in_progress" },
    ]);

    const finalStatuses = new Map(
      chunks.flatMap((chunk) =>
        chunk.activity ? [[chunk.activity.title, chunk.activity.status]] : [],
      ),
    );
    expect(Object.fromEntries(finalStatuses)).toMatchObject({
      "Read notes.txt": "done",
      "Edit notes.txt": "done",
      "↳ Find files *": "done",
      "Delegate: List files": "done",
    });
    expect(chunks.some((chunk) => chunk.activity?.checkpoint)).toBe(true);

    // The second request carries the Read result; the subagent gets no Task tool.
    const second = JSON.stringify(server.requests[1]);
    expect(second).toContain("1: alpha");
    expect(second).toContain("Be careful.");
    const subagentTools = (server.requests[3]?.["tools"] as { function: { name: string } }[]).map(
      (tool) => tool.function.name,
    );
    expect(subagentTools).not.toContain("Task");
    expect(JSON.stringify(server.requests[5])).toContain("Found notes.txt.");
    expect(chunks.at(-1)).toMatchObject({
      done: true,
      usage: { inputTokens: 60, outputTokens: 12 },
    });

    expect(await store.rollback("turn-1")).toHaveLength(1);
    expect(await readFile(join(project, "notes.txt"), "utf8")).toBe("alpha\n");
  });

  it("tells the model when the user denies an action and runs approved commands", async () => {
    const server = await fakeServer([
      () =>
        openAiTools(
          { name: "Write", args: { file_path: "new.txt", content: "x" } },
          { name: "Bash", args: { command: "echo zenith-ran" } },
        ),
      () => openAiText("Understood."),
    ]);
    closeServer = server.close;
    const model = openAiCompatibleModel({
      label: "Test",
      baseUrl: server.url,
      headers: async () => ({}),
    });

    const { chunks } = await run(model, (prompt) =>
      prompt.title === "Run a command" ? "allow" : "deny",
    );

    await expect(readFile(join(project, "new.txt"), "utf8")).rejects.toThrow();
    const results = JSON.stringify(server.requests[1]);
    expect(results).toContain("The user denied this action");
    expect(results).toContain("zenith-ran");
    expect(results).toContain("[exit code 0]");
    expect(
      chunks.find(
        (chunk) => chunk.activity?.title === "Write new.txt" && chunk.activity.status === "denied",
      ),
    ).toBeDefined();
  });

  it("applies permission rules, reports problems after edits, and calls MCP tools", async () => {
    const server = await fakeServer([
      () =>
        openAiTools(
          { name: "Write", args: { file_path: "new.txt", content: "x" } },
          { name: "Bash", args: { command: "echo should-not-run" } },
          { name: "mcp__demo__shout", args: { text: "hi" } },
        ),
      () => openAiText("Done."),
    ]);
    closeServer = server.close;
    const model = openAiCompatibleModel({
      label: "Test",
      baseUrl: server.url,
      headers: async () => ({}),
    });
    const edited: string[] = [];

    const { prompts, chunks } = await run(model, () => "allow", false, {
      permissionRules: () => parsePermissionRules("allow Write new.txt\ndeny Bash echo *"),
      afterEdit: async (_project, filePath) => {
        edited.push(filePath);
        return "fake-lsp reports errors in this file:\nnew.txt:1:1: Found ERROR";
      },
      extraTools: async () => ({
        specs: [{ name: "mcp__demo__shout", description: "Shout", parameters: { type: "object" } }],
        call: async (_name, input) => String(input["text"]).toUpperCase(),
      }),
    });

    // Only the MCP tool asked; the rules allowed the write and blocked the command.
    expect(prompts.map((prompt) => prompt.title)).toEqual(["mcp__demo__shout"]);
    expect(await readFile(join(project, "new.txt"), "utf8")).toBe("x");
    expect(edited).toHaveLength(1);
    expect(JSON.stringify(server.requests[0])).toContain("mcp__demo__shout");
    const results = JSON.stringify(server.requests[1]);
    expect(results).toContain("Found ERROR");
    expect(results).toContain("A permission rule set by the user blocks this action");
    expect(results).not.toContain("should-not-run\\n");
    expect(results).toContain('"content":"HI"');
    expect(
      chunks.find((chunk) => chunk.activity?.tool === "Bash" && chunk.activity.status === "denied"),
    ).toBeDefined();
  });

  it("asks before following a symbolic link out of the project, whatever the rules say", async () => {
    await mkdir(join(dir, "secret"));
    await writeFile(join(dir, "secret", "key.txt"), "SECRET-VALUE\n");
    await symlink(join(dir, "secret"), join(project, "link"));
    expect(await escapesProject(project, "link/key.txt")).toBe(true);
    expect(await escapesProject(project, "link/new-file.txt")).toBe(true);
    expect(await escapesProject(project, "notes.txt")).toBe(false);
    expect(await escapesProject(project, "missing/dir/file.txt")).toBe(false);

    const server = await fakeServer([
      () =>
        openAiTools(
          { name: "Read", args: { file_path: "link/key.txt" } },
          { name: "Grep", args: { pattern: "SECRET" } },
          { name: "Write", args: { file_path: "link/planted.txt", content: "x" } },
        ),
      () => openAiText("Done."),
    ]);
    closeServer = server.close;
    const model = openAiCompatibleModel({
      label: "Test",
      baseUrl: server.url,
      headers: async () => ({}),
    });

    const { prompts } = await run(model, () => "deny", false, {
      permissionRules: () => parsePermissionRules("allow Read *\nallow Write *"),
    });

    expect(prompts.map((prompt) => prompt.title)).toEqual([
      "Read link/key.txt",
      "Write link/planted.txt",
    ]);
    expect(prompts.every((prompt) => prompt.warning?.includes("outside the project"))).toBe(true);
    const results = JSON.stringify(server.requests[1]);
    expect(results).not.toContain("SECRET-VALUE");
    expect(results).toContain("No matches.");
    await expect(readFile(join(dir, "secret", "planted.txt"), "utf8")).rejects.toThrow();
  });

  it("remembers a fact in the user's profile after approval", async () => {
    await writeFile(join(dir, "USER.md"), "- Uses TypeScript\n");
    const server = await fakeServer([
      () => openAiTools({ name: "Remember", args: { fact: "Prefers  short answers" } }),
      () => openAiText("Noted."),
    ]);
    closeServer = server.close;
    const model = openAiCompatibleModel({
      label: "Test",
      baseUrl: server.url,
      headers: async () => ({}),
    });

    const { prompts, chunks } = await run(model, () => "allow");

    expect(prompts[0]).toMatchObject({ title: "Remember this about you" });
    expect(prompts[0]?.diff).toContain("+- Prefers short answers");
    expect(await readFile(join(dir, "USER.md"), "utf8")).toBe(
      "- Uses TypeScript\n- Prefers short answers\n",
    );
    expect(chunks.some((chunk) => chunk.memoryChanged)).toBe(true);
  });

  it("offers only reading tools in plan mode", async () => {
    const server = await fakeServer([() => openAiText("Plan: 1. Edit notes.txt")]);
    closeServer = server.close;
    const model = openAiCompatibleModel({
      label: "Test",
      baseUrl: server.url,
      headers: async () => ({}),
    });
    await run(model, () => "allow", true);
    const tools = (server.requests[0]?.["tools"] as { function: { name: string } }[]).map(
      (tool) => tool.function.name,
    );
    expect(tools).toEqual(["Read", "Glob", "Grep", "TodoWrite", "Task"]);
    expect(nativeToolNames({ allowedTools: ["Read"], subagent: true })).toEqual([
      "Read",
      "TodoWrite",
    ]);
  });

  it("drives the Anthropic Messages API with tool_use and tool_result blocks", async () => {
    const event = (value: unknown) => JSON.stringify(value);
    const server = await fakeServer([
      () => [
        event({ type: "message_start", message: { usage: { input_tokens: 20 } } }),
        event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
        event({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Reading." },
        }),
        event({
          type: "content_block_start",
          index: 1,
          content_block: { type: "tool_use", id: "toolu_1", name: "Read" },
        }),
        event({
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"file_pa' },
        }),
        event({
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: 'th":"notes.txt"}' },
        }),
        event({ type: "message_delta", usage: { output_tokens: 7 } }),
        event({ type: "message_stop" }),
      ],
      () => [
        event({ type: "message_start", message: { usage: { input_tokens: 30 } } }),
        event({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "It says alpha." },
        }),
        event({ type: "message_delta", usage: { output_tokens: 4 } }),
      ],
    ]);
    closeServer = server.close;
    const model = anthropicModel({ apiKey: async () => "key", baseUrl: server.url });

    const { chunks } = await run(model, () => "allow");

    expect(chunks.map((chunk) => chunk.delta).join("")).toBe("Reading.\n\nIt says alpha.");
    const second = server.requests[1] as {
      system: string;
      messages: { role: string; content: { type: string; content?: string }[] }[];
    };
    expect(second.system).toContain("Be careful.");
    expect(second.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(second.messages[2]?.content[0]).toMatchObject({
      type: "tool_result",
      content: "1: alpha\n2: ",
    });
    expect(chunks.at(-1)).toMatchObject({
      usage: { inputTokens: 50, outputTokens: 11 },
      contextUsage: { inputTokens: 30, outputTokens: 4 },
    });
  });

  it("explains when a model cannot use tools", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        '{"error":{"message":"registry.ollama.ai/library/qwen2.5vl:7b does not support tools"}}',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closeServer = () => new Promise((resolve) => server.close(resolve));
    const model = openAiCompatibleModel({
      label: "Ollama",
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      headers: async () => ({}),
    });
    await expect(run(model, () => "allow")).rejects.toThrow("This Ollama model can't use tools");
  });
});
