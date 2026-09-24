import { spawnResolved } from "./launch";
import { createInterface } from "node:readline";

import { stallNotice } from "./stall-notice";

const MAX_STDERR_CHARS = 16_000;
const KILL_GRACE_MS = 3_000;

export interface CliRunOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  signal?: AbortSignal;
}

export interface CliExit {
  exitCode: number | null;
  stderr: string;
  aborted: boolean;
}

export interface CliRun {
  lines: AsyncIterable<string>;
  exit: Promise<CliExit>;
  kill(): void;
  // The latest warning on stderr so far, for showing why output has stopped.
  notice(): string | undefined;
}

export function runCli(options: CliRunOptions): CliRun {
  const child = spawnResolved(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
  });

  let stderr = "";
  // The start of stderr explains a failure; its end holds the latest warning while running.
  let recentStderr = "";
  let aborted = false;
  let exited = false;

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (stderr.length < MAX_STDERR_CHARS) stderr = (stderr + chunk).slice(0, MAX_STDERR_CHARS);
    recentStderr = (recentStderr + chunk).slice(-MAX_STDERR_CHARS);
  });

  function kill() {
    if (exited) return;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!exited) child.kill("SIGKILL");
    }, KILL_GRACE_MS).unref();
  }

  const onAbort = () => {
    aborted = true;
    kill();
  };
  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener("abort", onAbort, { once: true });

  const exit = new Promise<CliExit>((resolve, reject) => {
    child.once("error", (error) => {
      exited = true;
      options.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.once("close", (exitCode) => {
      exited = true;
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode, stderr, aborted });
    });
  });
  // Callers read `exit` after draining lines; avoid an unhandled rejection in between.
  exit.catch(() => undefined);

  // A child that exits before reading stdin would otherwise raise EPIPE on this stream.
  child.stdin.on("error", () => undefined);
  child.stdin.end(options.stdin ?? "");

  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });

  return { lines, exit, kill, notice: () => stallNotice(recentStderr) };
}
