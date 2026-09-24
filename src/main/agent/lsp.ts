import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { spawnResolved } from "../cli/launch";

const START_TIMEOUT_MS = 20_000;
const FIRST_DIAGNOSTICS_TIMEOUT_MS = 15_000;
const DIAGNOSTICS_TIMEOUT_MS = 5_000;
// Servers may publish several times after one change; the last one within this pause counts.
const SETTLE_MS = 300;
const MAX_PROBLEMS = 20;

export interface LanguageServerSpec {
  name: string;
  // Language IDs by file extension.
  languages: Record<string, string>;
  command: string;
  args: string[];
  // Look for the command in the project's node_modules/.bin before the PATH.
  projectBin?: boolean;
}

const TS = { ".ts": "typescript", ".mts": "typescript", ".cts": "typescript" };
const JS = { ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript" };

// Candidates are tried in order; the first that starts serves the project.
export const LANGUAGE_SERVERS: readonly LanguageServerSpec[] = [
  {
    // TypeScript 7 has its own language server; earlier versions reject --lsp and exit.
    name: "TypeScript",
    languages: { ...TS, ...JS, ".tsx": "typescriptreact", ".jsx": "javascriptreact" },
    command: "tsc",
    args: ["--lsp", "--stdio"],
    projectBin: true,
  },
  {
    name: "typescript-language-server",
    languages: { ...TS, ...JS, ".tsx": "typescriptreact", ".jsx": "javascriptreact" },
    command: "typescript-language-server",
    args: ["--stdio"],
    projectBin: true,
  },
  {
    name: "pyright",
    languages: { ".py": "python" },
    command: "pyright-langserver",
    args: ["--stdio"],
    projectBin: true,
  },
  { name: "gopls", languages: { ".go": "go" }, command: "gopls", args: [] },
  { name: "rust-analyzer", languages: { ".rs": "rust" }, command: "rust-analyzer", args: [] },
];

interface Diagnostic {
  range?: { start?: { line?: number; character?: number } };
  severity?: number;
  message?: string;
}

interface Client {
  ready: Promise<void>;
  // Sends the file's new text and waits for the server's diagnostics for it.
  check(filePath: string, languageId: string, text: string): Promise<Diagnostic[] | undefined>;
  dispose(): void;
}

function startClient(
  spec: LanguageServerSpec,
  command: string,
  root: string,
  env: NodeJS.ProcessEnv,
): Client {
  const child: ChildProcessWithoutNullStreams = spawnResolved(command, spec.args, {
    cwd: root,
    env,
    windowsHide: true,
  });
  let nextId = 1;
  let dead = false;
  const pending = new Map<number, { resolve(result: unknown): void; reject(error: Error): void }>();
  let pull = false;
  const versions = new Map<string, number>();
  const listeners = new Map<string, (items: Diagnostic[]) => void>();
  let buffer = Buffer.alloc(0);

  const write = (message: object) => {
    if (dead) return;
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8");
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  };
  const request = (method: string, params: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      write({ id, method, params });
    });

  const handle = (message: Record<string, unknown>) => {
    const { id, method } = message;
    if (typeof method === "string" && id !== undefined) {
      // Requests from the server: answer so it doesn't wait. Configuration gets one empty entry per item.
      const items = (message["params"] as { items?: unknown[] } | undefined)?.items;
      write({
        id,
        result: method === "workspace/configuration" ? (items ?? []).map(() => null) : null,
      });
    } else if (typeof id === "number") {
      const waiter = pending.get(id);
      pending.delete(id);
      const error = message["error"] as { message?: string } | undefined;
      if (error) waiter?.reject(new Error(error.message ?? "Language server request failed."));
      else waiter?.resolve(message["result"]);
    } else if (method === "textDocument/publishDiagnostics") {
      const params = message["params"] as { uri?: string; diagnostics?: Diagnostic[] } | undefined;
      if (params?.uri) listeners.get(params.uri)?.(params.diagnostics ?? []);
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const length = Number(
        /Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, headerEnd).toString())?.[1],
      );
      if (!Number.isFinite(length) || buffer.length < headerEnd + 4 + length) return;
      const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString("utf8");
      buffer = buffer.subarray(headerEnd + 4 + length);
      try {
        handle(JSON.parse(body) as Record<string, unknown>);
      } catch {
        // Ignore a malformed message rather than stopping the server.
      }
    }
  });
  child.stderr.resume();
  const exited = new Promise<void>((resolve) => {
    const finish = () => {
      dead = true;
      resolve();
    };
    child.once("error", finish);
    child.once("close", finish);
  });
  child.stdin.on("error", () => undefined);

  const rootUri = pathToFileURL(root).href;
  const ready = Promise.race([
    request("initialize", {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: "project" }],
      capabilities: {
        textDocument: {
          publishDiagnostics: {},
          diagnostic: { dynamicRegistration: false },
          synchronization: { didSave: true, dynamicRegistration: false },
        },
        workspace: { configuration: true, workspaceFolders: true },
      },
    }).then((result) => {
      // Servers that answer diagnostic requests (TypeScript 7) may never push them for files.
      pull = Boolean(
        (result as { capabilities?: { diagnosticProvider?: unknown } } | undefined)?.capabilities
          ?.diagnosticProvider,
      );
      write({ method: "initialized", params: {} });
    }),
    exited.then(() => {
      throw new Error("stopped");
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), START_TIMEOUT_MS).unref(),
    ),
  ]);

  return {
    ready,
    async check(filePath, languageId, text) {
      await ready;
      const uri = pathToFileURL(filePath).href;
      const previous = versions.get(uri);
      const version = (previous ?? 0) + 1;
      versions.set(uri, version);
      const pushed = new Promise<Diagnostic[] | undefined>((resolve) => {
        if (pull) {
          resolve(undefined);
          return;
        }
        let latest: Diagnostic[] | undefined;
        let settle: ReturnType<typeof setTimeout> | undefined;
        const done = () => {
          clearTimeout(timeout);
          clearTimeout(settle);
          listeners.delete(uri);
          resolve(latest);
        };
        const timeout = setTimeout(
          done,
          previous === undefined ? FIRST_DIAGNOSTICS_TIMEOUT_MS : DIAGNOSTICS_TIMEOUT_MS,
        );
        listeners.set(uri, (items) => {
          latest = items;
          clearTimeout(settle);
          settle = setTimeout(done, SETTLE_MS);
        });
        void exited.then(done);
      });
      if (previous === undefined) {
        write({
          method: "textDocument/didOpen",
          params: { textDocument: { uri, languageId, version, text } },
        });
      } else {
        write({
          method: "textDocument/didChange",
          params: { textDocument: { uri, version }, contentChanges: [{ text }] },
        });
      }
      write({ method: "textDocument/didSave", params: { textDocument: { uri }, text } });
      if (!pull) return pushed;
      const report = await Promise.race([
        request("textDocument/diagnostic", { textDocument: { uri } }),
        new Promise<undefined>((resolve) =>
          setTimeout(
            () => resolve(undefined),
            previous === undefined ? FIRST_DIAGNOSTICS_TIMEOUT_MS : DIAGNOSTICS_TIMEOUT_MS,
          ).unref(),
        ),
      ]);
      const items = (report as { items?: Diagnostic[] } | undefined)?.items;
      return Array.isArray(items) ? items : undefined;
    },
    dispose() {
      if (dead) return;
      void request("shutdown", null).then(() => write({ method: "exit", params: null }));
      setTimeout(() => child.kill(), 1_000).unref();
    },
  };
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

// Language servers per project, started on the first edit of a matching file and kept until
// Zenith quits. A server that is not installed or fails to start is not tried again.
// ponytail: servers stay running for the app's lifetime; add an idle timeout if memory matters.
// Whether any known language server covers this file, so a check can say "not looked at"
// instead of "no errors" for a language nothing serves.
export function servedByLanguageServer(
  filePath: string,
  servers: readonly LanguageServerSpec[] = LANGUAGE_SERVERS,
): boolean {
  const extension = extname(filePath).toLowerCase();
  return servers.some((server) => extension in server.languages);
}

export function createLanguageServers(
  env: () => NodeJS.ProcessEnv,
  servers: readonly LanguageServerSpec[] = LANGUAGE_SERVERS,
) {
  const clients = new Map<string, Promise<Client | undefined>>();

  async function clientFor(spec: LanguageServerSpec, root: string): Promise<Client | undefined> {
    const key = `${spec.name}\n${root}`;
    let client = clients.get(key);
    if (!client) {
      client = (async () => {
        // On Windows npm installs the project's tools as .cmd shims, which launch.ts runs.
        const bin = process.platform === "win32" ? `${spec.command}.cmd` : spec.command;
        const local = join(root, "node_modules", ".bin", bin);
        const command = spec.projectBin && (await exists(local)) ? local : spec.command;
        let started: Client | undefined;
        try {
          // Starting throws for a Windows batch file that isn't an npm shim.
          started = startClient(spec, command, root, env());
          await started.ready;
          return started;
        } catch {
          started?.dispose();
          return undefined;
        }
      })();
      clients.set(key, client);
    }
    return client;
  }

  return {
    // Errors the project's language server reports for a file after a change, as text for the
    // agent; empty when there is no server for the file or it reports no errors.
    async problems(root: string, filePath: string, text: string): Promise<string> {
      const extension = extname(filePath).toLowerCase();
      let spec: LanguageServerSpec | undefined;
      let client: Client | undefined;
      for (const candidate of servers.filter((server) => extension in server.languages)) {
        client = await clientFor(candidate, root);
        if (client) {
          spec = candidate;
          break;
        }
      }
      const languageId = spec?.languages[extension];
      if (!spec || !client || !languageId) return "";
      const diagnostics = await client?.check(filePath, languageId, text).catch(() => undefined);
      const errors = (diagnostics ?? []).filter((item) => (item.severity ?? 1) === 1);
      if (errors.length === 0) return "";
      const name = relative(root, filePath) || filePath;
      const lines = errors.slice(0, MAX_PROBLEMS).map((item) => {
        const start = item.range?.start;
        return `${name}:${(start?.line ?? 0) + 1}:${(start?.character ?? 0) + 1}: ${item.message ?? ""}`;
      });
      if (errors.length > MAX_PROBLEMS) lines.push(`… ${errors.length - MAX_PROBLEMS} more errors`);
      return `${spec.name} reports errors in this file:\n${lines.join("\n")}`;
    },

    dispose() {
      for (const client of clients.values()) void client.then((started) => started?.dispose());
      clients.clear();
    },
  };
}

export type LanguageServers = ReturnType<typeof createLanguageServers>;
