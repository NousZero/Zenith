import type { Model } from "../../shared/types";
import {
  asRecord,
  lastNonEmptyLine,
  parseJsonLine,
  type CliLineEvent,
  type CliToolSpec,
} from "../cli/cli-adapter";
import { anthropicContent } from "./content";

// Claude Code takes an alias or a full model ID. Aliases follow whatever the installed version
// maps them to; a full ID pins one exact model. "Custom model…" in the pane accepts any ID.
const MODELS: Model[] = [
  { id: "default", label: "Default" },
  { id: "best", label: "Best available" },
  { id: "opus", label: "Opus" },
  { id: "opusplan", label: "Opus for planning, Sonnet to build" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
  { id: "fable", label: "Fable" },
  { id: "opus[1m]", label: "Opus · 1M context" },
  { id: "sonnet[1m]", label: "Sonnet · 1M context" },
  { id: "fable[1m]", label: "Fable · 1M context" },
  { id: "claude-opus-5", label: "claude-opus-5" },
  { id: "claude-sonnet-5", label: "claude-sonnet-5" },
  { id: "claude-fable-5-1", label: "claude-fable-5-1" },
  { id: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001" },
];

// Replaces Claude Code's agent prompt so answers compare like the raw model.
const NEUTRAL_SYSTEM_PROMPT = "You are a helpful assistant.";

const SIGN_IN_PATTERN = /not logged in|please run \/login|invalid api key|authenticat/i;
const SIGN_IN_MESSAGE = "Claude Code isn't signed in. Run `claude` in a terminal to sign in.";

function friendly(message: string): string {
  return SIGN_IN_PATTERN.test(message) ? SIGN_IN_MESSAGE : message;
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseClaudeCodeLine(line: string): CliLineEvent | undefined {
  const event = parseJsonLine(line);
  if (!event) return undefined;

  if (event["type"] === "stream_event") {
    const inner = asRecord(event["event"]);
    const delta = asRecord(inner?.["delta"]);
    if (inner?.["type"] === "content_block_delta" && delta?.["type"] === "text_delta") {
      const text = delta["text"];
      return typeof text === "string" && text !== "" ? { delta: text } : undefined;
    }
    return undefined;
  }

  if (event["type"] === "result") {
    const usage = asRecord(event["usage"]);
    const result: CliLineEvent = {};
    if (usage) {
      result.usage = {
        inputTokens:
          tokenCount(usage["input_tokens"]) +
          tokenCount(usage["cache_creation_input_tokens"]) +
          tokenCount(usage["cache_read_input_tokens"]),
        outputTokens: tokenCount(usage["output_tokens"]),
      };
    }
    const iterations = Array.isArray(usage?.["iterations"]) ? usage["iterations"] : [];
    const last = asRecord(iterations.at(-1));
    if (last) {
      result.contextUsage = {
        inputTokens:
          tokenCount(last["input_tokens"]) +
          tokenCount(last["cache_creation_input_tokens"]) +
          tokenCount(last["cache_read_input_tokens"]),
        outputTokens: tokenCount(last["output_tokens"]),
      };
    }
    // modelUsage maps each model used in the turn to its stats, including contextWindow.
    const windows = Object.values(asRecord(event["modelUsage"]) ?? {})
      .map((stats) => tokenCount(asRecord(stats)?.["contextWindow"]))
      .filter((window) => window > 0);
    if (windows.length > 0) result.contextWindow = Math.max(...windows);
    if (event["is_error"] === true) {
      const text = event["result"];
      result.error = friendly(
        typeof text === "string" && text.trim() !== "" ? text : "Claude Code reported an error.",
      );
    }
    return result;
  }

  return undefined;
}

export const claudeCodeSpec: CliToolSpec = {
  id: "claude-code",
  label: "Claude Code",

  async listModels() {
    return MODELS;
  },

  buildInvocation(model, { system, prompt, images }) {
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--tools",
      "",
      "--no-session-persistence",
      "--strict-mcp-config",
      "--setting-sources",
      "",
      `--system-prompt=${system ?? NEUTRAL_SYSTEM_PROMPT}`,
    ];
    if (model) args.push(`--model=${model}`);
    const env = { CLAUDE_CODE_DISABLE_THINKING: "1" };
    // Images need Claude Code's JSON input, which carries content blocks.
    if (images?.some((image) => image.data)) {
      args.push("--input-format", "stream-json");
      const message = {
        type: "user",
        message: {
          role: "user",
          content: anthropicContent({ role: "user", content: prompt, images }),
        },
      };
      return { args, stdin: `${JSON.stringify(message)}\n`, env };
    }
    // Hidden thinking costs tokens the pane never shows; chat comparisons run without it.
    return { args, stdin: prompt, env };
  },

  parseLine: parseClaudeCodeLine,

  describeFailure(exit) {
    const line = lastNonEmptyLine(exit.stderr);
    if (line) return friendly(line);
    return `Claude Code exited with code ${exit.exitCode ?? "unknown"}.`;
  },
};
