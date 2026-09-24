import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";

import { unifiedDiff } from "../../shared/diff";
import { decidePermission, type PermissionRule, wildcardMatch } from "../../shared/permissions";
import type {
  AgentActivity,
  AgentTodo,
  ChatChunk,
  PermissionPrompt,
  SendMessageRequest,
  TokenUsage,
} from "../../shared/types";
import { asRecord, DEFAULT_MODEL_ID, lastNonEmptyLine, parseJsonLine } from "../cli/cli-adapter";
import { assertSafeModelId, buildCliPrompt } from "../cli/transcript";
import { parseClaudeCodeLine } from "../providers/claude-code";
import { anthropicContent } from "../providers/content";

const KILL_GRACE_MS = 3_000;
const MAX_STDERR_CHARS = 16_000;
const MAX_DETAIL_CHARS = 400;

// Tools Claude Code may use in a project. Reads and todo updates run freely; Claude Code asks
// Zenith before edits, writes, and commands that are not read-only inside the project.
const AGENT_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "TodoWrite"];
const FREE_TOOLS = ["Read", "Glob", "Grep", "TodoWrite"];
const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md"];
const MAX_CONTEXT_FILE_BYTES = 20_000;

// Tools for one reply: plan mode keeps only reading tools; an agent definition may narrow the set.
export function agentTools(options: { planMode?: boolean; allowedTools?: string[] }): string[] {
  const base = options.planMode ? FREE_TOOLS : AGENT_TOOLS;
  if (!options.allowedTools) return base;
  const allowed = new Set(options.allowedTools.map((tool) => tool.trim()));
  return base.filter((tool) => allowed.has(tool) || tool === "TodoWrite");
}

// Claude Code runs with --setting-sources "", which skips its own project memory files,
// so Zenith passes the project's AGENTS.md and CLAUDE.md along as instructions.
export async function projectContext(projectPath: string): Promise<string> {
  const sections: string[] = [];
  for (const file of CONTEXT_FILES) {
    const text = await readFile(resolve(projectPath, file), "utf8").catch(() => "");
    if (text.trim() === "") continue;
    const clipped =
      text.length > MAX_CONTEXT_FILE_BYTES ? `${text.slice(0, MAX_CONTEXT_FILE_BYTES)}\n…` : text;
    sections.push(`<project-file name="${file}">\n${clipped.trim()}\n</project-file>`);
  }
  return sections.length > 0
    ? `Project instructions from ${projectPath}:\n\n${sections.join("\n\n")}`
    : "";
}
const FILE_TOOLS = new Set(["Edit", "Write"]);

export interface ClaudeAgentDeps {
  resolveBinary(): Promise<string | undefined>;
  childEnv(binaryPath: string): NodeJS.ProcessEnv;
  saveCheckpoint(turnId: string, projectPath: string, filePath: string): Promise<boolean>;
  syncTodos(projectPath: string, todos: AgentTodo[]): void;
  // Path of an MCP config file with the user's servers, if any are configured.
  mcpConfigPath(): Promise<string | undefined>;
  // The user's allow/ask/deny rules, read at the start of each reply.
  permissionRules?(): PermissionRule[];
  // Claude Code's own sandbox settings, when the user turned sandboxing on.
  sandboxSettings?(): Promise<string | undefined>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncate(value: string): string {
  return value.length > MAX_DETAIL_CHARS ? `${value.slice(0, MAX_DETAIL_CHARS)}…` : value;
}

function displayPath(projectPath: string, filePath: string): string {
  const relativePath = relative(projectPath, filePath);
  // Forward slashes on every OS, so a title reads the same as Git status, @ mentions, and the
  // review bar, and the path it names can be handed back to undo unchanged.
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)
    ? relativePath.split(sep).join("/")
    : filePath;
}

export function isInside(projectPath: string, filePath: string): boolean {
  const relativePath = relative(projectPath, resolve(projectPath, filePath));
  return !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

// True when a path lands outside the project once symbolic links are followed, so a link inside
// the project (for example to ~/.ssh) can't make an outside file look like a project file. A path
// that doesn't exist yet is judged by its nearest existing parent folder.
export async function escapesProject(projectPath: string, filePath: string): Promise<boolean> {
  const root = await realpath(projectPath).catch(() => resolve(projectPath));
  let current = resolve(projectPath, filePath || ".");
  for (;;) {
    const real = await realpath(current).catch(() => undefined);
    if (real !== undefined) return !isInside(root, real);
    const parent = dirname(current);
    if (parent === current) return true;
    current = parent;
  }
}

const PATH_TOOLS = new Set(["Read", "Glob", "Grep", "Edit", "Write", "MultiEdit", "NotebookEdit"]);

// The file or folder a tool call touches, for tools that take one.
export function toolPath(tool: string, input: Record<string, unknown>): string | undefined {
  if (!PATH_TOOLS.has(tool)) return undefined;
  return text(input["file_path"]) || text(input["notebook_path"]) || text(input["path"]) || ".";
}

// What a permission rule's pattern is matched against: the command, the URL, or the path
// (relative when inside the project).
export function ruleSubject(
  tool: string,
  input: Record<string, unknown>,
  projectPath: string,
): string {
  if (tool === "Bash") return text(input["command"]).trim();
  if (text(input["url"])) return text(input["url"]);
  const file = text(input["file_path"]) || text(input["notebook_path"]) || text(input["path"]);
  return file ? displayPath(projectPath, resolve(projectPath, file)) : "";
}

export function describeToolUse(
  tool: string,
  input: Record<string, unknown>,
  projectPath: string,
): string {
  const file = text(input["file_path"]) || text(input["path"]);
  switch (tool) {
    case "Read":
      return `Read ${displayPath(projectPath, file)}`;
    case "Edit":
      return `Edit ${displayPath(projectPath, file)}`;
    case "Write":
      return `Write ${displayPath(projectPath, file)}`;
    case "Bash":
      return `Run ${truncate(text(input["command"]))}`;
    case "Glob":
      return `Find files ${text(input["pattern"])}`;
    case "Grep":
      return `Search for ${text(input["pattern"])}`;
    case "TodoWrite":
      return "Update the task list";
    case "Remember":
      return `Remember: ${text(input["fact"])}`;
    case "Task":
      return `Delegate: ${text(input["description"]) || "subagent task"}`;
    default:
      return tool;
  }
}

// The file's contents after an Edit or Write, computed without touching the disk.
export function proposedContent(
  tool: string,
  input: Record<string, unknown>,
  before: string,
): string | undefined {
  if (tool === "Write") return text(input["content"]);
  if (tool !== "Edit") return undefined;
  const oldString = text(input["old_string"]);
  const newString = text(input["new_string"]);
  if (oldString === "") return newString + before;
  return input["replace_all"] === true
    ? before.split(oldString).join(newString)
    : before.replace(oldString, () => newString);
}

export function parseTodos(input: Record<string, unknown>): AgentTodo[] {
  const todos = Array.isArray(input["todos"]) ? input["todos"] : [];
  return todos.flatMap((item): AgentTodo[] => {
    const todo = asRecord(item);
    const status = todo?.["status"];
    if (
      typeof todo?.["content"] !== "string" ||
      (status !== "pending" && status !== "in_progress" && status !== "completed")
    ) {
      return [];
    }
    return [{ content: todo["content"], status }];
  });
}

export async function permissionPrompt(
  tool: string,
  input: Record<string, unknown>,
  projectPath: string,
): Promise<PermissionPrompt> {
  const options: PermissionPrompt["options"] = [
    { id: "allow", label: "Allow", kind: "allow_once" },
    { id: "allow-tool", label: `Allow all ${tool} this reply`, kind: "allow_always" },
    { id: "deny", label: "Deny", kind: "reject_once" },
  ];
  const title = describeToolUse(tool, input, projectPath);
  // The same text a rule is matched against, so "never ask again" writes a rule that works.
  const subject = ruleSubject(tool, input, projectPath);
  const names = { tool, ...(subject ? { subject } : {}) };
  if (FILE_TOOLS.has(tool)) {
    const filePath = text(input["file_path"]);
    const before = await readFile(filePath, "utf8").catch(() => "");
    const after = proposedContent(tool, input, before) ?? before;
    return {
      ...names,
      title,
      options,
      diff: unifiedDiff(before, after, displayPath(projectPath, filePath)),
      ...((await escapesProject(projectPath, filePath))
        ? { warning: "This file is outside the project folder." }
        : {}),
    };
  }
  if (tool === "Bash") {
    return {
      ...names,
      title: "Run a command",
      options,
      detail: text(input["command"]),
      warning: "Undo restores this project folder, but not changes a command makes elsewhere.",
    };
  }
  return { title, options, detail: truncate(JSON.stringify(input, null, 2)) };
}

// Runs Claude Code as an agent in a project folder for one reply. Claude Code uses its own
// tools; every action it can't take freely comes to Zenith as a can_use_tool control request.
export async function* runClaudeAgent(
  original: SendMessageRequest & { projectPath: string },
  deps: ClaudeAgentDeps,
): AsyncIterable<ChatChunk> {
  // Claude Code reports real paths, so compare against the folder's real path (macOS /var → /private/var).
  const request = { ...original, projectPath: await realpath(original.projectPath) };
  const binary = await deps.resolveBinary();
  if (!binary) throw new Error("Claude Code isn't installed on this computer.");
  const built = buildCliPrompt(request.messages);
  const { prompt } = built;
  const system = [await projectContext(request.projectPath), built.system ?? ""]
    .filter((part) => part.trim() !== "")
    .join("\n\n");
  const tools = agentTools(request);
  const rules = deps.permissionRules?.() ?? [];
  // A reading tool named by an ask or deny rule is not pre-approved, so Claude Code asks Zenith.
  const freeTools = tools.filter(
    (tool) =>
      FREE_TOOLS.includes(tool) &&
      !rules.some((rule) => rule.action !== "allow" && wildcardMatch(rule.tool, tool)),
  );
  const mcpConfig = await deps.mcpConfigPath();
  const sandboxSettings = await deps.sandboxSettings?.();
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-prompt-tool",
    "stdio",
    "--permission-mode",
    "manual",
    "--tools",
    tools.join(","),
    "--allowedTools",
    freeTools.join(","),
    "--setting-sources",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
    ...(mcpConfig ? ["--mcp-config", mcpConfig] : []),
    ...(sandboxSettings ? ["--settings", sandboxSettings] : []),
    ...(system ? [`--append-system-prompt=${system}`] : []),
    ...(request.model === DEFAULT_MODEL_ID ? [] : [`--model=${assertSafeModelId(request.model)}`]),
  ];

  const child = spawn(binary, args, {
    cwd: request.projectPath,
    env: deps.childEnv(binary),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-MAX_STDERR_CHARS);
  });
  child.stdin.on("error", () => undefined);
  const exit = new Promise<number | null>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("close", resolveExit);
  });
  let exited = false;
  exit.then(
    () => (exited = true),
    () => (exited = true),
  );
  const kill = () => {
    if (exited) return;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!exited) child.kill("SIGKILL");
    }, KILL_GRACE_MS).unref();
  };
  request.signal?.addEventListener("abort", kill, { once: true });

  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  send({
    type: "user",
    message: {
      role: "user",
      content: anthropicContent({ role: "user", content: prompt, images: built.images ?? [] }),
    },
  });

  const turnId = request.turnId ?? "";
  const activities = new Map<string, AgentActivity>();
  const allowedTools = new Set<string>();
  let reply = "";
  let usage: TokenUsage | undefined;
  let contextWindow: number | undefined;
  let contextUsage: TokenUsage | undefined;
  let streamError: string | undefined;

  const update = (id: string, patch: Partial<AgentActivity>): ChatChunk | undefined => {
    const current = activities.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    activities.set(id, next);
    return { delta: "", done: false, activity: next };
  };

  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      const event = parseJsonLine(line);
      if (!event) continue;

      if (event["type"] === "control_request") {
        const inner = asRecord(event["request"]);
        const requestId = text(event["request_id"]);
        if (inner?.["subtype"] !== "can_use_tool") {
          send({
            type: "control_response",
            response: { subtype: "error", request_id: requestId, error: "Unsupported request" },
          });
          continue;
        }
        const tool = text(inner["tool_name"]);
        const input = asRecord(inner["input"]) ?? {};
        const toolUseId = text(inner["tool_use_id"]);
        const path = toolPath(tool, input);
        const escapes = path !== undefined && (await escapesProject(request.projectPath, path));
        const decision = decidePermission(
          rules,
          tool,
          ruleSubject(tool, input, request.projectPath),
        );
        // Anything that reaches outside the project asks, whatever the rules or earlier choices say.
        let allowed =
          !escapes &&
          (decision === "allow" ||
            (decision !== "deny" && allowedTools.has(tool)) ||
            (decision === undefined && FREE_TOOLS.includes(tool)));
        if (!allowed && decision !== "deny") {
          const waiting = update(toolUseId, { status: "awaiting-approval" });
          if (waiting) yield waiting;
          const choice =
            request.signal?.aborted || !request.requestPermission
              ? undefined
              : await request.requestPermission({
                  ...(escapes
                    ? {
                        warning:
                          "This path leads outside the project folder, directly or through a symbolic link.",
                      }
                    : {}),
                  ...(await permissionPrompt(tool, input, request.projectPath)),
                });
          if (choice === "allow-tool") allowedTools.add(tool);
          allowed = choice === "allow" || choice === "allow-tool";
        }
        let checkpoint = false;
        if (allowed && FILE_TOOLS.has(tool) && turnId) {
          checkpoint = await deps
            .saveCheckpoint(
              turnId,
              request.projectPath,
              resolve(request.projectPath, text(input["file_path"])),
            )
            .catch(() => false);
        }
        send({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: requestId,
            response: allowed
              ? { behavior: "allow", updatedInput: input }
              : {
                  behavior: "deny",
                  message:
                    decision === "deny"
                      ? "A permission rule in Zenith blocks this action. Do not retry it."
                      : "The user denied this action in Zenith.",
                },
          },
        });
        const decided = update(
          toolUseId,
          allowed
            ? { status: "running", ...(checkpoint ? { checkpoint } : {}) }
            : { status: "denied" },
        );
        if (decided) yield decided;
        continue;
      }

      if (event["type"] === "assistant") {
        const content = asRecord(event["message"])?.["content"];
        for (const block of Array.isArray(content) ? content : []) {
          const toolUse = asRecord(block);
          if (toolUse?.["type"] !== "tool_use") continue;
          const id = text(toolUse["id"]);
          const tool = text(toolUse["name"]);
          const input = asRecord(toolUse["input"]) ?? {};
          const activity: AgentActivity = {
            id,
            tool,
            title: describeToolUse(tool, input, request.projectPath),
            status: "running",
          };
          activities.set(id, activity);
          yield { delta: "", done: false, activity };
          if (tool === "TodoWrite") {
            const todos = parseTodos(input);
            // The board is keyed by the folder as the user chose it.
            deps.syncTodos(original.projectPath, todos);
            yield { delta: "", done: false, todos };
          }
        }
        continue;
      }

      if (event["type"] === "user") {
        const content = asRecord(event["message"])?.["content"];
        for (const block of Array.isArray(content) ? content : []) {
          const result = asRecord(block);
          if (result?.["type"] !== "tool_result") continue;
          const id = text(result["tool_use_id"]);
          const current = activities.get(id);
          if (!current) continue;
          const output = Array.isArray(result["content"])
            ? result["content"].map((part) => text(asRecord(part)?.["text"])).join("\n")
            : text(result["content"]);
          const status =
            current.status === "denied"
              ? "denied"
              : result["is_error"] === true
                ? "failed"
                : "done";
          const finished = update(id, { status, detail: truncate(output.trim()) });
          if (finished) yield finished;
        }
        continue;
      }

      if (event["type"] === "stream_event") {
        const inner = asRecord(event["event"]);
        const block = asRecord(inner?.["content_block"]);
        // Text from separate assistant messages would otherwise run together.
        if (
          inner?.["type"] === "content_block_start" &&
          block?.["type"] === "text" &&
          reply !== "" &&
          !reply.endsWith("\n\n")
        ) {
          reply += "\n\n";
          yield { delta: "\n\n", done: false };
        }
      }

      const parsed = parseClaudeCodeLine(line);
      if (parsed?.delta) {
        reply += parsed.delta;
        yield { delta: parsed.delta, done: false };
      }
      if (parsed?.usage) usage = parsed.usage;
      if (parsed?.contextWindow) contextWindow = parsed.contextWindow;
      if (parsed?.contextUsage) contextUsage = parsed.contextUsage;
      if (parsed?.error) streamError ??= parsed.error;
      if (event["type"] === "result") child.stdin.end();
    }

    const code = await exit;
    if (request.signal?.aborted) return;
    if (streamError !== undefined && reply === "") throw new Error(streamError);
    if (code !== 0 && reply === "") {
      throw new Error(
        lastNonEmptyLine(stderr) ?? `Claude Code exited with code ${code ?? "unknown"}.`,
      );
    }
    yield {
      delta: "",
      done: true,
      ...(usage ? { usage } : {}),
      ...(contextWindow ? { contextWindow } : {}),
      ...(contextUsage ? { contextUsage } : {}),
    };
  } finally {
    request.signal?.removeEventListener("abort", kill);
    kill();
  }
}
