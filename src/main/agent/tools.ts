import { spawn } from "node:child_process";
import { glob, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { unifiedDiff } from "../../shared/diff";
import { escapesProject, isInside, proposedContent } from "./claude-agent";
import { sandboxedShell, type SandboxKind } from "./sandbox";

const MAX_READ_LINES = 2_000;
const MAX_FILE_BYTES = 1_000_000;
const MAX_OUTPUT_CHARS = 30_000;
const MAX_MATCHES = 200;
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const MAX_COMMAND_TIMEOUT_MS = 600_000;
const SKIPPED = /(^|[\\/])(node_modules|\.git|dist|build|out)([\\/]|$)/;

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const string = (description: string) => ({ type: "string", description });
const integer = (description: string) => ({ type: "integer", description });

// Named like Claude Code's tools so an agent definition's tools list works for every connection.
export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: "Read",
    description: "Read a text file. Returns numbered lines. Use offset and limit for long files.",
    parameters: {
      type: "object",
      properties: {
        file_path: string("Path, relative to the project or absolute"),
        offset: integer("First line to read, starting at 1"),
        limit: integer("How many lines to read"),
      },
      required: ["file_path"],
    },
  },
  {
    name: "Glob",
    description: "Find files by glob pattern, e.g. src/**/*.ts. Skips node_modules and .git.",
    parameters: {
      type: "object",
      properties: { pattern: string("Glob pattern"), path: string("Folder to search from") },
      required: ["pattern"],
    },
  },
  {
    name: "Grep",
    description: "Search file contents with a regular expression. Returns path:line: text.",
    parameters: {
      type: "object",
      properties: {
        pattern: string("JavaScript regular expression"),
        path: string("Folder or file to search"),
        glob: string("Only search files matching this glob, e.g. **/*.ts"),
      },
      required: ["pattern"],
    },
  },
  {
    name: "Edit",
    description:
      "Replace old_string with new_string in a file. old_string must appear exactly once unless replace_all is true. Read the file first.",
    parameters: {
      type: "object",
      properties: {
        file_path: string("File to change"),
        old_string: string("Exact text to replace"),
        new_string: string("Replacement text"),
        replace_all: { type: "boolean", description: "Replace every occurrence" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "Write",
    description: "Create or overwrite a file with the given content.",
    parameters: {
      type: "object",
      properties: { file_path: string("File to write"), content: string("Full file content") },
      required: ["file_path", "content"],
    },
  },
  {
    name: "Bash",
    description: "Run a shell command in the project folder. Long output is cut.",
    parameters: {
      type: "object",
      properties: {
        command: string("Command to run"),
        timeout: integer("Timeout in milliseconds, up to 600000"),
        outside_sandbox: {
          type: "boolean",
          description:
            "Set only when the sandbox blocked this command (no network, writes only in the project) and it truly needs more. The user is asked first.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "TodoWrite",
    description: "Replace the task list shown to the user. Keep one task in_progress at a time.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: string("Task"),
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
            },
            required: ["content", "status"],
          },
        },
      },
      required: ["todos"],
    },
  },
  {
    name: "Remember",
    description:
      "Save a lasting fact about the user (preferences, role, projects) to their profile, so every future conversation knows it. The user approves each change. Don't save secrets or one-off task details.",
    parameters: {
      type: "object",
      properties: { fact: string("One short sentence to remember") },
      required: ["fact"],
    },
  },
  {
    name: "Task",
    description:
      "Delegate a self-contained task to a subagent with a fresh context. It has the same tools except Task and returns its final answer.",
    parameters: {
      type: "object",
      properties: {
        description: string("Three to five word summary"),
        prompt: string("Everything the subagent needs to know and do"),
      },
      required: ["description", "prompt"],
    },
  },
];

const ASKING_TOOLS = new Set(["Edit", "Write", "Bash", "Remember"]);

// The profile with the new fact added as a bullet, and the diff the user approves.
async function rememberChange(profilePath: string, input: Record<string, unknown>) {
  const fact = text(input["fact"]).replace(/\s+/g, " ").trim();
  if (!fact) throw new ToolError("fact must not be empty.");
  const before = await readFile(profilePath, "utf8").catch(() => "");
  const after = `${before.trimEnd()}${before.trim() ? "\n" : ""}- ${fact}\n`;
  return { before, after, fact };
}

export async function rememberPrompt(profilePath: string, input: Record<string, unknown>) {
  const { before, after } = await rememberChange(profilePath, input).catch(() => ({
    before: "",
    after: "",
  }));
  return {
    title: "Remember this about you",
    options: [
      { id: "allow", label: "Remember", kind: "allow_once" as const },
      { id: "deny", label: "Don't remember", kind: "reject_once" as const },
    ],
    diff: unifiedDiff(before, after, "USER.md"),
  };
}

export async function runRemember(profilePath: string, input: Record<string, unknown>) {
  const { after, fact } = await rememberChange(profilePath, input);
  await mkdir(dirname(profilePath), { recursive: true });
  await writeFile(profilePath, after, "utf8");
  return `Saved to the user's profile: ${fact}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clip(output: string): string {
  return output.length > MAX_OUTPUT_CHARS
    ? `${output.slice(0, MAX_OUTPUT_CHARS)}\n… (${output.length - MAX_OUTPUT_CHARS} more characters cut)`
    : output;
}

export function resolvePath(projectPath: string, path: string): string {
  return resolve(projectPath, path || ".");
}

// Edits, writes, commands, and MCP tools always ask; reading asks only outside the project folder.
export function needsApproval(
  tool: string,
  input: Record<string, unknown>,
  projectPath: string,
): boolean {
  if (ASKING_TOOLS.has(tool) || tool.startsWith("mcp__")) return true;
  if (tool === "Read" || tool === "Glob" || tool === "Grep") {
    return !isInside(projectPath, text(input["file_path"]) || text(input["path"]) || ".");
  }
  return false;
}

// Problems the model can fix itself; their message goes back as the tool result.
export class ToolError extends Error {}

async function readText(path: string): Promise<string> {
  const info = await stat(path).catch(() => undefined);
  if (!info) throw new ToolError(`File not found: ${path}`);
  if (!info.isFile()) throw new ToolError(`Not a file: ${path}`);
  if (info.size > MAX_FILE_BYTES) throw new ToolError(`File is larger than 1 MB: ${path}`);
  return readFile(path, "utf8");
}

export async function runRead(projectPath: string, input: Record<string, unknown>) {
  const content = await readText(resolvePath(projectPath, text(input["file_path"])));
  const lines = content.split("\n");
  const offset = Math.max(1, Number(input["offset"]) || 1);
  const limit = Math.min(MAX_READ_LINES, Math.max(1, Number(input["limit"]) || MAX_READ_LINES));
  const slice = lines.slice(offset - 1, offset - 1 + limit);
  const numbered = slice.map((line, index) => `${offset + index}: ${line}`).join("\n");
  const rest = lines.length - (offset - 1 + slice.length);
  return clip(rest > 0 ? `${numbered}\n… ${rest} more lines; use offset to continue` : numbered);
}

export async function runGlob(projectPath: string, input: Record<string, unknown>) {
  const base = resolvePath(projectPath, text(input["path"]));
  const found: string[] = [];
  for await (const entry of glob(text(input["pattern"]) || "**/*", { cwd: base })) {
    if (SKIPPED.test(entry)) continue;
    found.push(entry);
    if (found.length >= MAX_MATCHES) break;
  }
  if (found.length === 0) return "No files match.";
  return found.sort().join("\n") + (found.length >= MAX_MATCHES ? "\n… more files not shown" : "");
}

export async function runGrep(projectPath: string, input: Record<string, unknown>) {
  let pattern: RegExp;
  try {
    pattern = new RegExp(text(input["pattern"]));
  } catch (error) {
    throw new ToolError(`Invalid regular expression: ${(error as Error).message}`);
  }
  const base = resolvePath(projectPath, text(input["path"]));
  const info = await stat(base).catch(() => undefined);
  if (!info) throw new ToolError(`Not found: ${base}`);
  const files: string[] = [];
  if (info.isFile()) {
    files.push(base);
  } else {
    for await (const entry of glob(text(input["glob"]) || "**/*", { cwd: base })) {
      if (!SKIPPED.test(entry)) files.push(resolve(base, entry));
      if (files.length >= 5_000) break;
    }
  }
  const matches: string[] = [];
  // Inside the project, skip files reached through symbolic links that point outside it.
  const searchingOutside = await escapesProject(projectPath, base);
  for (const file of files) {
    if (!searchingOutside && (await escapesProject(projectPath, file))) continue;
    const fileInfo = await stat(file).catch(() => undefined);
    if (!fileInfo?.isFile() || fileInfo.size > MAX_FILE_BYTES) continue;
    const content = await readFile(file, "utf8").catch(() => "");
    if (content.includes(String.fromCharCode(0))) continue; // Skip binary files.
    const lines = content.split("\n");
    for (let index = 0; index < lines.length && matches.length < MAX_MATCHES; index++) {
      const line = lines[index] ?? "";
      if (pattern.test(line)) {
        matches.push(`${relative(projectPath, file)}:${index + 1}: ${line.slice(0, 300)}`);
      }
    }
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches.length === 0 ? "No matches." : clip(matches.join("\n"));
}

export async function runEdit(projectPath: string, input: Record<string, unknown>) {
  const path = resolvePath(projectPath, text(input["file_path"]));
  const before = await readText(path);
  const oldString = text(input["old_string"]);
  if (oldString === "") {
    throw new ToolError("old_string must not be empty; use Write to create files.");
  }
  const count = before.split(oldString).length - 1;
  if (count === 0) {
    throw new ToolError("old_string was not found. Read the file and copy the text exactly.");
  }
  if (count > 1 && input["replace_all"] !== true) {
    throw new ToolError(
      `old_string appears ${count} times; include more surrounding text or set replace_all.`,
    );
  }
  await writeFile(path, proposedContent("Edit", input, before) ?? before, "utf8");
  return `Edited ${relative(projectPath, path) || path}.`;
}

export async function runWrite(projectPath: string, input: Record<string, unknown>) {
  const path = resolvePath(projectPath, text(input["file_path"]));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text(input["content"]), "utf8");
  return `Wrote ${relative(projectPath, path) || path}.`;
}

export interface BashSandbox {
  kind: SandboxKind;
  // Folder the sandbox may write temporary files to.
  tempRoot: string;
}

export async function runBash(
  projectPath: string,
  input: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
  sandbox?: BashSandbox,
): Promise<string> {
  const timeout = Math.min(
    MAX_COMMAND_TIMEOUT_MS,
    Math.max(1_000, Number(input["timeout"]) || DEFAULT_COMMAND_TIMEOUT_MS),
  );
  const [shell, ...flags] =
    process.platform === "win32" ? ["cmd.exe", "/d", "/s", "/c"] : ["/bin/sh", "-c"];
  let file = shell ?? "/bin/sh";
  let args = [...flags, text(input["command"])];
  let childEnv = env;
  const sandboxed = sandbox !== undefined && input["outside_sandbox"] !== true;
  if (sandbox && sandboxed) {
    const wrapped = await sandboxedShell(
      sandbox.kind,
      projectPath,
      text(input["command"]),
      sandbox.tempRoot,
      env,
    );
    file = wrapped.file;
    args = wrapped.args;
    childEnv = { ...env, TMPDIR: wrapped.tempDir, TMP: wrapped.tempDir, TEMP: wrapped.tempDir };
  }
  return new Promise((resolveOutput) => {
    const child = spawn(file, args, {
      cwd: projectPath,
      env: childEnv,
      windowsHide: true,
    });
    let output = "";
    const append = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_CHARS * 2) output += chunk.toString("utf8");
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const stop = () => child.kill("SIGTERM");
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener("abort", stop, { once: true });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveOutput(`Could not start the command: ${error.message}`);
    });
    child.on("close", (code, killedBy) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      const status = killedBy ? `stopped (${killedBy})` : `exit code ${code ?? "unknown"}`;
      // A failure inside the sandbox may be the sandbox itself; say how to get past it.
      const hint =
        sandboxed && code !== 0
          ? "\n[ran in the sandbox: no network, writes only in the project. If the sandbox blocked it, retry with outside_sandbox: true, which asks the user.]"
          : "";
      resolveOutput(clip(`${output.trimEnd()}\n[${status}]${hint}`.trimStart()));
    });
  });
}
