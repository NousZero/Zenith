import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { logError } from "../error-log";
import type { McpServerConfig } from "../mcp-config";
import type { ToolSpec } from "./tools";
import { ToolError } from "./tools";

const START_TIMEOUT_MS = 30_000;
const MAX_RESULT_CHARS = 30_000;
const PROTOCOL_VERSION = "2025-06-18";

type Json = Record<string, unknown>;

interface McpConnection {
  tools: { name: string; description: string; inputSchema: Json }[];
  call(tool: string, input: Json, signal?: AbortSignal): Promise<string>;
  alive(): boolean;
  dispose(): void;
}

// One MCP server over stdio (newline-delimited JSON-RPC), as Claude Code and OpenCode run them.
async function connect(
  config: McpServerConfig,
  cwd: string,
  env: NodeJS.ProcessEnv,
  clientVersion: string,
): Promise<McpConnection> {
  const child = spawn(config.command, config.args, {
    cwd,
    env: { ...env, ...config.env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stderr.resume();
  child.stdin.on("error", () => undefined);
  let nextId = 1;
  let exitError: Error | undefined;
  const pending = new Map<number, { resolve(value: Json): void; reject(error: Error): void }>();
  const write = (message: Json) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  const request = (method: string, params: Json) =>
    new Promise<Json>((resolve, reject) => {
      if (exitError) {
        reject(exitError);
        return;
      }
      const id = nextId++;
      pending.set(id, { resolve, reject });
      write({ id, method, params });
    });
  const fail = (error: Error) => {
    exitError = error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };
  child.once("error", fail);
  child.once("close", () => fail(new Error("The MCP server stopped.")));

  void (async () => {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      let message: Json;
      try {
        message = JSON.parse(line) as Json;
      } catch {
        continue;
      }
      const id = message["id"];
      if (typeof message["method"] === "string") {
        // Zenith offers no sampling or roots; answer requests so the server doesn't wait.
        if (id !== undefined) write({ id, error: { code: -32601, message: "Not supported" } });
        continue;
      }
      const waiter = typeof id === "number" ? pending.get(id) : undefined;
      if (!waiter || typeof id !== "number") continue;
      pending.delete(id);
      const error = message["error"] as { message?: string } | undefined;
      if (error) waiter.reject(new Error(error.message ?? "MCP request failed."));
      else waiter.resolve((message["result"] as Json | undefined) ?? {});
    }
  })();

  const timer = setTimeout(() => {
    fail(new Error("The MCP server did not start in time."));
    child.kill();
  }, START_TIMEOUT_MS);
  try {
    await request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "zenith", version: clientVersion },
    });
    write({ method: "notifications/initialized" });
    const tools: McpConnection["tools"] = [];
    let cursor: string | undefined;
    do {
      const page = await request("tools/list", cursor ? { cursor } : {});
      for (const tool of Array.isArray(page["tools"]) ? (page["tools"] as Json[]) : []) {
        if (typeof tool["name"] !== "string") continue;
        tools.push({
          name: tool["name"],
          description: typeof tool["description"] === "string" ? tool["description"] : "",
          inputSchema: (tool["inputSchema"] as Json | undefined) ?? { type: "object" },
        });
      }
      cursor = typeof page["nextCursor"] === "string" ? page["nextCursor"] : undefined;
    } while (cursor);
    clearTimeout(timer);
    return {
      tools,
      async call(tool, input, signal) {
        const id = nextId;
        const cancel = () =>
          write({
            method: "notifications/cancelled",
            params: { requestId: id, reason: "Stopped" },
          });
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          const result = await request("tools/call", { name: tool, arguments: input });
          const content = Array.isArray(result["content"]) ? (result["content"] as Json[]) : [];
          const text = content
            .map((item) =>
              item["type"] === "text"
                ? String(item["text"] ?? "")
                : `[${String(item["type"])} content]`,
            )
            .join("\n")
            .slice(0, MAX_RESULT_CHARS);
          if (result["isError"] === true)
            throw new ToolError(text || "The tool reported an error.");
          return text || "(The tool returned no text.)";
        } finally {
          signal?.removeEventListener("abort", cancel);
        }
      },
      alive: () => !exitError,
      dispose: () => child.kill(),
    };
  } catch (error) {
    clearTimeout(timer);
    child.kill();
    throw error;
  }
}

// Tool names sent to models must match ^[a-zA-Z0-9_-]{1,64}$.
function toolName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

export interface ExtraTools {
  specs: ToolSpec[];
  call(name: string, input: Json, signal?: AbortSignal): Promise<string>;
}

// The user's MCP servers for Zenith's own agent, started per project on first use and kept
// running until the config changes or Zenith quits. A server that fails to start is skipped.
export function createMcpTools(deps: {
  servers(): Promise<Record<string, McpServerConfig>>;
  env(): NodeJS.ProcessEnv;
  clientVersion: string;
}) {
  const connections = new Map<string, Promise<McpConnection | undefined>>();

  return {
    async forProject(projectPath: string): Promise<ExtraTools> {
      const servers = await deps.servers();
      const current = new Set(
        Object.entries(servers).map(([server, config]) =>
          JSON.stringify([projectPath, server, config]),
        ),
      );
      // Stop this project's servers that were removed or changed in mcp.json.
      for (const [key, connection] of connections) {
        if ((JSON.parse(key) as unknown[])[0] === projectPath && !current.has(key)) {
          void connection.then((ready) => ready?.dispose());
          connections.delete(key);
        }
      }
      const routes = new Map<string, { connection: McpConnection; tool: string }>();
      const specs: ToolSpec[] = [];
      for (const [server, config] of Object.entries(servers)) {
        const key = JSON.stringify([projectPath, server, config]);
        let connection = connections.get(key);
        if (connection && !(await connection)?.alive()) connection = undefined;
        if (!connection) {
          connection = connect(config, projectPath, deps.env(), deps.clientVersion).catch(
            (error: unknown) => {
              console.error(`MCP server ${server} failed to start:`, error);
              logError("main", error);
              connections.delete(key);
              return undefined;
            },
          );
          connections.set(key, connection);
        }
        const ready = await connection;
        for (const tool of ready?.tools ?? []) {
          const name = toolName(server, tool.name);
          if (routes.has(name)) continue;
          routes.set(name, { connection: ready as McpConnection, tool: tool.name });
          specs.push({
            name,
            description: `${tool.description} (MCP server "${server}")`.trim(),
            parameters: tool.inputSchema,
          });
        }
      }
      return {
        specs,
        async call(name, input, signal) {
          const route = routes.get(name);
          if (!route) throw new ToolError(`The ${name} tool is not available.`);
          return route.connection.call(route.tool, input, signal);
        },
      };
    },

    dispose() {
      for (const connection of connections.values())
        void connection.then((ready) => ready?.dispose());
      connections.clear();
    },
  };
}

export type McpTools = ReturnType<typeof createMcpTools>;
