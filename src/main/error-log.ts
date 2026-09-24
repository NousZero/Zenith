import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { redact } from "./audit-log";

// A local, append-only record of what went wrong, so a crash a user hits leaves something
// readable behind instead of vanishing into a terminal nobody has open. Nothing here leaves the
// machine: it is a file on disk, surfaced only through "Report a problem" and what the user
// copies from it themselves.
//
// A module-level singleton (set once from app.getPath("userData") in index.ts) so call sites can
// `logError(...)` directly, the same way audit-log.ts's `redact` is imported and called directly,
// instead of threading a logger through every store and factory in src/main.
const MAX_BYTES = 1024 * 1024; // Rotate at ~1 MB so the log never grows without bound.
const DEFAULT_READ_BYTES = 64 * 1024;
const MAX_RENDERER_MESSAGE = 2_000;
const MAX_RENDERER_STACK = 8_000;

export type LogLevel = "error" | "warn";
export type LogSource = "main" | "renderer" | "crash" | `ipc:${string}`;

let logFile: string | null = null;

export function initErrorLog(userDataPath: string): void {
  logFile = join(userDataPath, "logs", "zenith.log");
}

export function logPath(): string {
  if (!logFile) throw new Error("initErrorLog was not called.");
  return logFile;
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

// Writing must never throw into the caller: a failed log write is swallowed, the same way a
// failed audit write is in ipc.ts's auditRecord.
function write(level: LogLevel, source: LogSource, detail: string): void {
  if (!logFile) return;
  // One physical line per entry, so tailing or grepping the file stays meaningful even when the
  // detail is a multi-line stack trace.
  const flattened = detail.replace(/\r?\n/g, " | ");
  const line = `${new Date().toISOString()} [${level}] [${source}] ${redact(flattened)}\n`;
  try {
    mkdirSync(dirname(logFile), { recursive: true });
  } catch {
    return;
  }
  if (sizeOf(logFile) + Buffer.byteLength(line) > MAX_BYTES) {
    try {
      renameSync(logFile, `${logFile}.1`);
    } catch {
      // Nothing to rotate, or rotation failed; keep appending to what's there.
    }
  }
  try {
    appendFileSync(logFile, line, "utf8");
  } catch {
    // A failure to log must never break the caller.
  }
}

export function logError(source: LogSource, error: unknown): void {
  write("error", source, describe(error));
}

export function logWarn(source: LogSource, message: string): void {
  write("warn", source, message);
}

export function readRecentLog(maxBytes: number = DEFAULT_READ_BYTES): string {
  if (!logFile) return "";
  try {
    const buffer = readFileSync(logFile);
    return buffer.subarray(Math.max(0, buffer.length - maxBytes)).toString("utf8");
  } catch {
    return "";
  }
}

// Renderer errors arrive over IPC as untrusted input: validate their shape and cap their size
// before they reach the log.
export function logRendererError(payload: unknown): void {
  if (typeof payload !== "object" || payload === null) return;
  const { message, stack } = payload as { message?: unknown; stack?: unknown };
  if (typeof message !== "string") return;
  const trimmedMessage = message.slice(0, MAX_RENDERER_MESSAGE);
  const detail =
    typeof stack === "string"
      ? `${trimmedMessage}\n${stack.slice(0, MAX_RENDERER_STACK)}`
      : trimmedMessage;
  logError("renderer", detail);
}
