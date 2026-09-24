import { type ChildProcessWithoutNullStreams } from "node:child_process";

import { spawnResolved } from "../cli/launch";
import { stallNotice } from "../cli/stall-notice";
import { createInterface } from "node:readline";

const MAX_STDERR_CHARS = 16_000;
const KILL_GRACE_MS = 3_000;

type Params = Record<string, unknown>;
type RequestHandler = (params: Params) => Promise<unknown>;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Params;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class AcpRequestError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
  ) {
    super(message);
  }
}

// Newline-delimited JSON-RPC 2.0 over an agent's stdio, as the Agent Client Protocol specifies.
export class AcpConnection {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  private readonly requestHandlers = new Map<string, RequestHandler>();
  private readonly notificationHandlers = new Map<string, (params: Params) => void>();
  private nextId = 1;
  private stderr = "";
  private exitError: Error | undefined;

  constructor(options: { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }) {
    this.child = spawnResolved(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-MAX_STDERR_CHARS);
    });
    this.child.stdin.on("error", () => undefined);
    this.child.once("error", (error) => this.fail(error));
    this.child.once("close", (code) => {
      const detail = lastLine(this.stderr);
      this.fail(
        new Error(`The agent exited (code ${code ?? "none"})${detail ? `: ${detail}` : "."}`),
      );
    });
    createInterface({ input: this.child.stdout, crlfDelay: Infinity }).on("line", (line) =>
      this.receive(line),
    );
  }

  // What the agent last warned about on stderr, for showing why a reply has gone quiet.
  get notice(): string | undefined {
    return stallNotice(this.stderr);
  }

  get closed(): boolean {
    return this.exitError !== undefined;
  }

  onRequest(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  onNotification(method: string, handler: (params: Params) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  request<T>(method: string, params: Params): Promise<T> {
    if (this.exitError) return Promise.reject(this.exitError);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: Params): void {
    if (!this.exitError) this.write({ jsonrpc: "2.0", method, params });
  }

  close(): void {
    if (this.closed) return;
    this.child.kill("SIGTERM");
    setTimeout(() => {
      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.child.kill("SIGKILL");
      }
    }, KILL_GRACE_MS).unref();
  }

  private write(message: JsonRpcMessage): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private fail(error: Error): void {
    if (this.exitError) return;
    this.exitError = error;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  private receive(line: string): void {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return; // Agents may log to stdout by mistake; only JSON-RPC lines matter.
    }
    if (message.method === undefined) {
      const waiter = typeof message.id === "number" ? this.pending.get(message.id) : undefined;
      if (!waiter || typeof message.id !== "number") return;
      this.pending.delete(message.id);
      if (message.error) {
        waiter.reject(
          new AcpRequestError(
            message.error.message ?? "The agent returned an error.",
            message.error.code,
          ),
        );
      } else {
        waiter.resolve(message.result);
      }
      return;
    }
    const params = message.params ?? {};
    if (message.id === undefined) {
      this.notificationHandlers.get(message.method)?.(params);
      return;
    }
    const id = message.id;
    const handler = this.requestHandlers.get(message.method);
    if (!handler) {
      this.write({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
      return;
    }
    handler(params).then(
      (result) => this.write({ jsonrpc: "2.0", id, result: result ?? null }),
      (error: unknown) =>
        this.write({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
        }),
    );
  }
}

function lastLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}
