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
// Node's own npm.cmd and npx.cmd, installed beside node.exe, put the script in a variable first:
//   SET "NPX_CLI_JS=%~dp0\node_modules\npm\bin\npx-cli.js"
//   ...
//   "%NODE_EXE%" "%NPX_CLI_JS%" %*
// That exact form is recognised too, and runs npm's bundled script.
// Anything else ending in .cmd or .bat is refused rather than handed to a shell.

// The script an npm .cmd shim runs, relative to the shim's folder, or undefined when the text is
// not an npm shim.
export function npmShimScript(text: string): string | undefined {
  const script = /"%~?dp0%?\\?([^"%]+)"\s+%\*/i.exec(text)?.[1];
  // A script without a .js extension, such as TypeScript's tsc or Biome's biome, is run with node
  // only when the shim itself runs node.
  if (script && (/\.(?:c|m)?js$/i.test(script) || /^\s*SET "_prog=node"\s*$/im.test(text))) {
    return script.replace(/\\/g, "/");
  }
  // ponytail: a newer npm installed globally over Node's own, which npx.cmd would prefer after
  // asking npm-prefix.js, is ignored and Node's bundled npm runs; ask npm-prefix.js if that matters.
  const tool = /^"%NODE_EXE%"\s+"%(NP[MX])_CLI_JS%"\s+%\*\s*$/im.exec(text)?.[1]?.toLowerCase();
  if (!tool) return undefined;
  const assigned = new RegExp(
    `^SET "${tool}_CLI_JS=%~dp0\\\\node_modules\\\\npm\\\\bin\\\\${tool}-cli\\.js"\\s*$`,
    "im",
  ).test(text);
  return assigned ? `node_modules/npm/bin/${tool}-cli.js` : undefined;
}

function findOnPath(fileNames: string[], env: NodeJS.ProcessEnv): string | undefined {
  for (const directory of (env["PATH"] ?? env["Path"] ?? "").split(delimiter).filter(Boolean)) {
    for (const fileName of fileNames) {
      const candidate = join(directory, fileName);
      try {
        accessSync(candidate);
        return candidate;
      } catch {
        // Keep looking.
      }
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
  if (platform !== "win32") return { command, args: [] };
  // Node only tries .com and .exe after a bare name, so a user-configured `npx` or any tool npm
  // installed as a .cmd would not be found; look for it on PATH as cmd.exe's PATHEXT would.
  const program = /[\\/]/.test(command)
    ? command
    : (findOnPath(extname(command) ? [command] : [`${command}.exe`, `${command}.cmd`], env) ??
      command);
  const extension = extname(program).toLowerCase();
  if (extension !== ".cmd" && extension !== ".bat") return { command: program, args: [] };
  let script: string | undefined;
  try {
    script = npmShimScript(readFileSync(program, "utf8"));
  } catch {
    script = undefined;
  }
  if (!script) {
    throw new Error(`${program} is a Windows batch file Zenith can't run without a shell.`);
  }
  const folder = dirname(program);
  // The shim prefers a node.exe installed beside it, as npm does.
  let node: string | undefined = join(folder, "node.exe");
  try {
    accessSync(node);
  } catch {
    node = findOnPath(["node.exe"], env);
  }
  if (!node) throw new Error(`Node.js is needed to run ${program}, and it isn't on PATH.`);
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
