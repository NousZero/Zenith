import { readFile } from "node:fs/promises";

import { writeFileAtomic } from "./atomic-write";

// The user's MCP servers, in the same shape Claude Code and Claude Desktop use.
export interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

// Returns the servers in a config text, or throws a message suitable for the user.
export function parseMcpConfig(text: string): Record<string, McpServerConfig> {
  if (text.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("mcp.json is not valid JSON.");
  }
  const servers = (parsed as { mcpServers?: unknown } | null)?.mcpServers;
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    throw new Error('mcp.json needs an "mcpServers" object.');
  }
  const result: Record<string, McpServerConfig> = {};
  for (const [name, value] of Object.entries(servers)) {
    const server = value as { command?: unknown; args?: unknown; env?: unknown } | null;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
      throw new Error(`Server name "${name}" may only use letters, digits, "-" and "_".`);
    }
    if (typeof server?.command !== "string" || server.command.trim() === "") {
      throw new Error(`Server "${name}" needs a "command".`);
    }
    const args = server.args ?? [];
    if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
      throw new Error(`Server "${name}" has "args" that are not a list of strings.`);
    }
    const env = server.env ?? {};
    if (
      typeof env !== "object" ||
      env === null ||
      Array.isArray(env) ||
      !Object.values(env).every((item) => typeof item === "string")
    ) {
      throw new Error(`Server "${name}" has "env" that is not an object of strings.`);
    }
    result[name] = { command: server.command, args, env: env as Record<string, string> };
  }
  return result;
}

export function createMcpConfig(filePath: string) {
  const read = () => readFile(filePath, "utf8").catch(() => "");
  const servers = async () => {
    try {
      return parseMcpConfig(await read());
    } catch {
      return {};
    }
  };
  return {
    read,
    servers,
    async write(text: string): Promise<void> {
      parseMcpConfig(text);
      await writeFileAtomic(filePath, text);
    },
    // For Claude Code's --mcp-config; undefined when no servers are configured.
    async claudeConfigPath(): Promise<string | undefined> {
      return Object.keys(await servers()).length > 0 ? filePath : undefined;
    },
    async acpServers(): Promise<unknown[]> {
      return Object.entries(await servers()).map(([name, server]) => ({
        name,
        command: server.command,
        args: server.args,
        env: Object.entries(server.env).map(([key, value]) => ({ name: key, value })),
      }));
    },
  };
}
