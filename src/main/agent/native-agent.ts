import { realpath } from "node:fs/promises";

import type {
  AgentActivity,
  AgentTodo,
  ChatChunk,
  PermissionPrompt,
  SendMessageRequest,
  TokenUsage,
} from "../../shared/types";
import { decidePermission, type PermissionRule } from "../../shared/permissions";
import {
  describeToolUse,
  escapesProject,
  parseTodos,
  permissionPrompt,
  projectContext,
  ruleSubject,
  toolPath,
} from "./claude-agent";
import type { ExtraTools } from "./mcp-client";
import type { AgentMessage, ToolCall, ToolModel } from "./models";
import {
  needsApproval,
  rememberPrompt,
  runRemember,
  resolvePath,
  runBash,
  runEdit,
  runGlob,
  runGrep,
  runRead,
  runWrite,
  TOOL_SPECS,
  ToolError,
} from "./tools";

const MAX_STEPS = 30;
const MAX_RESULT_DETAIL = 400;
const PLAN_TOOLS = new Set(["Read", "Glob", "Grep", "TodoWrite", "Task"]);

export interface NativeAgentDeps {
  model: ToolModel;
  childEnv: NodeJS.ProcessEnv;
  saveCheckpoint(turnId: string, projectPath: string, filePath: string): Promise<boolean>;
  syncTodos(projectPath: string, todos: AgentTodo[]): void;
  // The user's profile file (USER.md) that the Remember tool adds to.
  profilePath?: string;
  // The user's allow/ask/deny rules, read at the start of each reply.
  permissionRules?(): PermissionRule[];
  // Formatting and language-server problems after an approved Edit or Write, as text for the model.
  afterEdit?(projectPath: string, filePath: string): Promise<string>;
  // Tools from the user's MCP servers.
  extraTools?(projectPath: string): Promise<ExtraTools>;
}

function agentPrompt(projectPath: string, subagent: boolean): string {
  return [
    subagent
      ? "You are a subagent of Zenith's coding agent. Finish the delegated task and reply with a concise report of what you found or changed."
      : "You are Zenith's coding agent.",
    `You work in the project folder ${projectPath}. Relative paths are relative to it.`,
    "Use the tools to inspect files before changing them. Prefer Edit for small changes. The user approves edits, writes, and commands; if one is denied, adapt instead of retrying it.",
    "Keep going until the task is done, then summarize what you did. Keep replies concise.",
  ].join("\n");
}

// Tool names for one run: plan mode keeps only reading tools, an agent definition may narrow
// them, and subagents never get Task, so delegation can't recurse.
export function nativeToolNames(options: {
  planMode?: boolean;
  allowedTools?: string[];
  subagent?: boolean;
}): string[] {
  const allowed = options.allowedTools ? new Set(options.allowedTools) : undefined;
  return TOOL_SPECS.map((tool) => tool.name).filter(
    (name) =>
      (!options.planMode || PLAN_TOOLS.has(name)) &&
      (!options.subagent || name !== "Task") &&
      (!allowed || allowed.has(name) || name === "TodoWrite"),
  );
}

function parseArguments(call: ToolCall): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(call.arguments || "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function addUsage(total: TokenUsage | undefined, next: TokenUsage | undefined) {
  if (!next) return total;
  return {
    inputTokens: (total?.inputTokens ?? 0) + next.inputTokens,
    outputTokens: (total?.outputTokens ?? 0) + next.outputTokens,
  };
}

// Zenith's own agent loop for connections that call tools through an API.
export async function* runNativeAgent(
  original: SendMessageRequest & { projectPath: string },
  deps: NativeAgentDeps,
  subagent = false,
): AsyncIterable<ChatChunk> {
  const projectPath = await realpath(original.projectPath);
  const request = { ...original, projectPath };
  const toolNames = new Set(nativeToolNames({ ...request, subagent }));
  // MCP tools can change things, so plan mode leaves them out; an agent definition may name a
  // tool ("mcp__server__tool") or a whole server ("mcp__server").
  const extra =
    request.planMode || !deps.extraTools ? undefined : await deps.extraTools(projectPath);
  const extraSpecs = (extra?.specs ?? []).filter(
    (spec) =>
      !request.allowedTools ||
      request.allowedTools.some((name) => spec.name === name || spec.name.startsWith(`${name}__`)),
  );
  for (const spec of extraSpecs) toolNames.add(spec.name);
  const tools = [...TOOL_SPECS.filter((tool) => toolNames.has(tool.name)), ...extraSpecs];
  const rules = deps.permissionRules?.() ?? [];
  const context = subagent ? "" : await projectContext(projectPath);
  const system = [
    agentPrompt(projectPath, subagent),
    context,
    ...request.messages.filter((message) => message.role === "system").map((m) => m.content),
  ]
    .filter((part) => part.trim() !== "")
    .join("\n\n");
  const messages: AgentMessage[] = [
    { role: "system", content: system },
    ...request.messages.flatMap((message): AgentMessage[] =>
      message.role === "system"
        ? []
        : message.role === "user"
          ? [{ role: "user", content: message.content }]
          : [{ role: "assistant", content: message.content, toolCalls: [] }],
    ),
  ];

  const allowAll = new Set<string>();
  let usage: TokenUsage | undefined;
  let contextUsage: TokenUsage | undefined;
  let wroteText = false;

  const activity = (value: AgentActivity): ChatChunk => ({
    delta: "",
    done: false,
    activity: value,
  });

  for (let step = 0; step < MAX_STEPS; step++) {
    if (request.signal?.aborted) return;
    let turn: { text: string; toolCalls: ToolCall[]; usage?: TokenUsage } | undefined;
    let separated = false;
    for await (const event of deps.model.stream(request.model, messages, tools, request.signal)) {
      if ("delta" in event) {
        if (wroteText && !separated) {
          separated = true;
          yield { delta: "\n\n", done: false };
        }
        wroteText = true;
        yield { delta: event.delta, done: false };
      } else {
        turn = event.turn;
      }
    }
    if (!turn) throw new Error("The model ended without a reply.");
    usage = addUsage(usage, turn.usage);
    if (turn.usage) contextUsage = turn.usage;
    messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls });
    if (turn.toolCalls.length === 0) {
      yield {
        delta: "",
        done: true,
        ...(usage ? { usage } : {}),
        ...(contextUsage ? { contextUsage } : {}),
      };
      return;
    }

    for (const call of turn.toolCalls) {
      const input = parseArguments(call);
      const base: AgentActivity = {
        id: call.id,
        tool: call.name,
        title: input ? describeToolUse(call.name, input, projectPath) : call.name,
        status: "running",
      };
      let result: string;
      if (!input) {
        result = "Error: the tool arguments were not valid JSON object text. Try again.";
        yield activity({ ...base, status: "failed", detail: result });
      } else if (!toolNames.has(call.name)) {
        result = `Error: the ${call.name} tool is not available here.`;
        yield activity({ ...base, status: "failed", detail: result });
      } else {
        yield activity(base);
        const absolute =
          typeof input["file_path"] === "string"
            ? { ...input, file_path: resolvePath(projectPath, input["file_path"]) }
            : input;
        const path = toolPath(call.name, input);
        // A symbolic link inside the project can point outside it; such calls always ask.
        const escapes = path !== undefined && (await escapesProject(projectPath, path));
        const decision = decidePermission(
          rules,
          call.name,
          ruleSubject(call.name, input, projectPath),
        );
        let allowed = decision !== "deny";
        const asks =
          escapes ||
          decision === "ask" ||
          (decision === undefined && needsApproval(call.name, input, projectPath));
        if (allowed && asks && (escapes || !allowAll.has(call.name))) {
          yield activity({ ...base, status: "awaiting-approval" });
          const prompt: PermissionPrompt =
            call.name === "Remember"
              ? await rememberPrompt(deps.profilePath ?? "", input)
              : await permissionPrompt(call.name, absolute, projectPath);
          const choice =
            request.signal?.aborted || !request.requestPermission
              ? undefined
              : await request.requestPermission(
                  escapes && !prompt.warning
                    ? {
                        ...prompt,
                        warning:
                          "This path leads outside the project folder, directly or through a symbolic link.",
                      }
                    : prompt,
                );
          if (choice === "allow-tool") allowAll.add(call.name);
          allowed = choice === "allow" || choice === "allow-tool";
        }
        if (request.signal?.aborted) return;
        if (!allowed) {
          result =
            decision === "deny"
              ? "A permission rule set by the user blocks this action. Do not retry it; continue another way or explain."
              : "The user denied this action. Do not retry it; continue another way or explain.";
          yield activity({ ...base, status: "denied" });
        } else {
          let checkpoint = false;
          if ((call.name === "Edit" || call.name === "Write") && request.turnId) {
            checkpoint = await deps
              .saveCheckpoint(request.turnId, original.projectPath, String(absolute["file_path"]))
              .catch(() => false);
          }
          let failed = false;
          try {
            switch (call.name) {
              case "Read":
                result = await runRead(projectPath, input);
                break;
              case "Glob":
                result = await runGlob(projectPath, input);
                break;
              case "Grep":
                result = await runGrep(projectPath, input);
                break;
              case "Edit":
              case "Write": {
                result = await (call.name === "Edit" ? runEdit : runWrite)(projectPath, input);
                const notes = await deps
                  .afterEdit?.(projectPath, String(absolute["file_path"]))
                  .catch(() => "");
                if (notes) result = `${result}\n\n${notes}`;
                break;
              }
              case "Bash":
                result = await runBash(projectPath, input, deps.childEnv, request.signal);
                break;
              case "Remember": {
                if (!deps.profilePath) throw new ToolError("Memory is not available here.");
                result = await runRemember(deps.profilePath, input);
                yield { delta: "", done: false, memoryChanged: true };
                break;
              }
              case "TodoWrite": {
                const todos = parseTodos(input);
                deps.syncTodos(original.projectPath, todos);
                yield { delta: "", done: false, todos };
                result = "Task list updated.";
                break;
              }
              case "Task": {
                const report: string[] = [];
                for await (const chunk of runNativeAgent(
                  {
                    ...original,
                    messages: [{ role: "user", content: String(input["prompt"] ?? "") }],
                  },
                  deps,
                  true,
                )) {
                  if (chunk.activity) {
                    yield activity({
                      ...chunk.activity,
                      id: `${call.id}:${chunk.activity.id}`,
                      title: `↳ ${chunk.activity.title}`,
                    });
                  }
                  if (chunk.todos) yield { delta: "", done: false, todos: chunk.todos };
                  if (chunk.delta) report.push(chunk.delta);
                  if (chunk.done) usage = addUsage(usage, chunk.usage);
                }
                result = report.join("").trim() || "The subagent finished without a report.";
                break;
              }
              default:
                if (!extra || !call.name.startsWith("mcp__")) {
                  result = `Error: unknown tool ${call.name}.`;
                  failed = true;
                  break;
                }
                result = await extra.call(call.name, input, request.signal);
            }
          } catch (error) {
            if (request.signal?.aborted) return;
            failed = true;
            result = `Error: ${error instanceof Error ? error.message : String(error)}`;
            if (!(error instanceof ToolError))
              console.error(`Agent tool ${call.name} failed:`, error);
          }
          yield activity({
            ...base,
            status: failed ? "failed" : "done",
            detail: result.slice(0, MAX_RESULT_DETAIL),
            ...(checkpoint ? { checkpoint } : {}),
          });
        }
      }
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: result });
    }
  }

  yield { delta: `${wroteText ? "\n\n" : ""}(Stopped after ${MAX_STEPS} steps.)`, done: false };
  yield {
    delta: "",
    done: true,
    ...(usage ? { usage } : {}),
    ...(contextUsage ? { contextUsage } : {}),
  };
}
