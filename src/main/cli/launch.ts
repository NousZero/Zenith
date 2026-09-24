import {
  execFile,
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
  type ExecFileException,
  type ExecFileOptions,
  type SpawnOptions,
} from "node:child_process";
import { accessSync, readFileSync } from "node:fs";
import { delimiter, dirname, extname, join, resolve } from "node:path";

// On Windows, npm installs command-line tools (Gemini, Copilot, Hermes, ...) as .cmd shims, and
// Node refuses to spawn a .cmd without a shell. Running one through cmd.exe would put the
// arguments at the mercy of its quoting rules, so instead the shim is read and its script run with
// node directly: npm's cmd-shim always ends by running node on a script beside it, like
//   "%_prog%"  "%dp0%\node_modules\@google\gemini-cli\dist\index.js" %*
// Anything else ending in .cmd or .bat is refused rather than handed to a shell.

// The script an npm .cmd shim runs, relative to the shim's folder, or undefined when the text is
// not an npm shim.
export function npmShimScript(text: string): string | undefined {
  const match = /"%~?dp0%?\\?([^"%]+\.(?:c|m)?js)"\s+%\*/i.exec(text);
  return match?.[1]?.replace(/\\/g, "/");
}

function findOnPath(fileName: string, env: NodeJS.ProcessEnv): string | undefined {
  for (const directory of (env["PATH"] ?? env["Path"] ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(directory, fileName);
    try {
      accessSync(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return undefined;
}

// The program and leading arguments that actually run `command`.
export function launchPlan(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  const extension = extname(command).toLowerCase();
  if (platform !== "win32" || (extension !== ".cmd" && extension !== ".bat")) {
    return { command, args: [] };
  }
  let script: string | undefined;
  try {
    script = npmShimScript(readFileSync(command, "utf8"));
  } catch {
    script = undefined;
  }
  if (!script) {
    throw new Error(`${command} is a Windows batch file Zenith can't run without a shell.`);
  }
  const folder = dirname(command);
  // The shim prefers a node.exe installed beside it, as npm does.
  let node: string | undefined = join(folder, "node.exe");
  try {
    accessSync(node);
  } catch {
    node = findOnPath("node.exe", env);
  }
  if (!node) throw new Error(`Node.js is needed to run ${command}, and it isn't on PATH.`);
  return { command: node, args: [resolve(folder, script)] };
}

// Always piped and never through a shell, which is how every agent process is run.
export function spawnResolved(
  command: string,
  args: readonly string[],
  options: Omit<SpawnOptions, "stdio" | "shell">,
): ChildProcessWithoutNullStreams {
  const plan = launchPlan(command, options.env ?? process.env);
  return spawn(plan.command, [...plan.args, ...args], { ...options, shell: false, stdio: "pipe" });
}

export function execFileResolved(
  command: string,
  args: readonly string[],
  options: ExecFileOptions,
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
): ChildProcess {
  const plan = launchPlan(command, options.env ?? process.env);
  return execFile(
    plan.command,
    [...plan.args, ...args],
    { ...options, shell: false, encoding: "utf8" },
    (error, stdout, stderr) => callback(error, String(stdout), String(stderr)),
  );
}
