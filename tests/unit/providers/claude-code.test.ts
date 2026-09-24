import { describe, expect, it } from "vitest";

import { claudeCodeSpec, parseClaudeCodeLine } from "../../../src/main/providers/claude-code";

// Captured from `claude -p --output-format stream-json` (Claude Code 2.1.270).
const DELTA_LINE =
  '{"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "ong"}}, "session_id": "1021b9e2-1350-4080-9f0a-0d6124f70952", "parent_tool_use_id": null, "uuid": "18cb802f-9710-4896-b3fd-e670e9a1c911"}';
const RESULT_LINE =
  '{"type": "result", "subtype": "success", "is_error": false, "result": "pong", "usage": {"input_tokens": 2, "cache_creation_input_tokens": 3056, "cache_read_input_tokens": 3289, "output_tokens": 4}}';

describe("parseClaudeCodeLine", () => {
  it("extracts streamed text deltas", () => {
    expect(parseClaudeCodeLine(DELTA_LINE)).toEqual({ delta: "ong" });
  });

  it("counts cached prompt tokens as input usage", () => {
    expect(parseClaudeCodeLine(RESULT_LINE)).toEqual({
      usage: { inputTokens: 6347, outputTokens: 4 },
    });
  });

  it("reads the context window from modelUsage", () => {
    // Shape captured from Claude Code 2.1.270 with --model=haiku.
    const line = JSON.stringify({
      type: "result",
      is_error: false,
      usage: { input_tokens: 497, output_tokens: 36 },
      modelUsage: { "claude-haiku-4-5-20251001": { inputTokens: 497, contextWindow: 200000 } },
    });
    expect(parseClaudeCodeLine(line)).toEqual({
      usage: { inputTokens: 497, outputTokens: 36 },
      contextWindow: 200000,
    });
  });

  it("reports the last model call separately from the reply's total usage", () => {
    const line = JSON.stringify({
      type: "result",
      is_error: false,
      usage: {
        input_tokens: 30,
        cache_read_input_tokens: 9000,
        output_tokens: 300,
        iterations: [
          { input_tokens: 10, cache_read_input_tokens: 4000, output_tokens: 100 },
          { input_tokens: 20, cache_read_input_tokens: 5000, output_tokens: 200 },
        ],
      },
    });
    expect(parseClaudeCodeLine(line)).toEqual({
      usage: { inputTokens: 9030, outputTokens: 300 },
      contextUsage: { inputTokens: 5020, outputTokens: 200 },
    });
  });

  it("maps a sign-in failure result to guidance", () => {
    const line = JSON.stringify({
      type: "result",
      is_error: true,
      result: "Invalid API key · Please run /login",
    });
    expect(parseClaudeCodeLine(line)?.error).toBe(
      "Claude Code isn't signed in. Run `claude` in a terminal to sign in.",
    );
  });

  it("reads the session id from the init and result messages", () => {
    const init = '{"type":"system","subtype":"init","session_id":"abc"}';
    expect(parseClaudeCodeLine(init)).toEqual({ sessionId: "abc" });
    const result = JSON.stringify({ type: "result", is_error: false, session_id: "abc" });
    expect(parseClaudeCodeLine(result)).toEqual({ sessionId: "abc" });
  });

  it("ignores non-text events and non-JSON output", () => {
    expect(parseClaudeCodeLine('{"type":"system","subtype":"init"}')).toBeUndefined();
    expect(
      parseClaudeCodeLine('{"type":"stream_event","event":{"type":"message_stop"}}'),
    ).toBeUndefined();
    expect(parseClaudeCodeLine("not json")).toBeUndefined();
  });
});

describe("claudeCodeSpec.buildInvocation", () => {
  it("disables tools, settings, MCP, and session persistence, and sends the prompt on stdin", () => {
    const { args, stdin, env } = claudeCodeSpec.buildInvocation("haiku", {
      system: undefined,
      prompt: "--not-a-flag",
    });
    expect(stdin).toBe("--not-a-flag");
    expect(env).toEqual({ CLAUDE_CODE_DISABLE_THINKING: "1" });
    expect(args).toEqual(
      expect.arrayContaining(["--no-session-persistence", "--strict-mcp-config"]),
    );
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args).toContain("--system-prompt=You are a helpful assistant.");
    expect(args.at(-1)).toBe("--model=haiku");
    expect(args.join(" ")).not.toContain("--not-a-flag");
  });

  it("uses session memory as the system prompt and omits --model for the default", () => {
    const { args } = claudeCodeSpec.buildInvocation(undefined, {
      system: "- bullet memory",
      prompt: "q",
    });
    expect(args).toContain("--system-prompt=- bullet memory");
    expect(args.some((arg) => arg.startsWith("--model"))).toBe(false);
  });

  it("saves a pane's turn so it can be continued, and continues a named session", () => {
    const kept = claudeCodeSpec.buildInvocation(undefined, { system: undefined, prompt: "q" }, {});
    expect(kept.args).not.toContain("--no-session-persistence");
    expect(kept.args.some((arg) => arg.startsWith("--resume"))).toBe(false);
    const resumed = claudeCodeSpec.buildInvocation(
      undefined,
      { system: undefined, prompt: "q" },
      { resume: "abc" },
    );
    expect(resumed.args).toContain("--resume=abc");
    expect(resumed.args).toContain("--system-prompt=You are a helpful assistant.");
  });
});
