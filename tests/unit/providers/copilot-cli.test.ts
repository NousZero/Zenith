import { describe, expect, it } from "vitest";

import {
  copilotCliSpec,
  parseCopilotLine,
  parseCopilotModelList,
} from "../../../src/main/providers/copilot-cli";

describe("parseCopilotLine", () => {
  it("extracts message deltas", () => {
    expect(
      parseCopilotLine(
        '{"type":"assistant.message_delta","data":{"deltaContent":"pong","messageId":"m1"},"ephemeral":true,"id":"e1","timestamp":"t","parentId":null}',
      ),
    ).toEqual({ delta: "pong" });
  });

  it("reads token usage", () => {
    expect(
      parseCopilotLine(
        '{"type":"assistant.usage","data":{"model":"claude-sonnet-5","inputTokens":120,"outputTokens":8}}',
      ),
    ).toEqual({ usage: { inputTokens: 120, outputTokens: 8 } });
  });

  it("maps a policy error to an actionable message", () => {
    expect(
      parseCopilotLine(
        '{"type":"session.error","data":{"errorType":"authorization","message":"Access denied by policy settings"}}',
      )?.error,
    ).toContain("organization policy");
  });

  it("ignores session bookkeeping events", () => {
    expect(
      parseCopilotLine('{"type":"session.mcp_servers_loaded","data":{"servers":[]}}'),
    ).toBeUndefined();
  });
});

describe("parseCopilotModelList", () => {
  it("reads the model section of `copilot help config`", () => {
    const help = [
      "  `logLevel`: log level for CLI.",
      "",
      "  `model`: AI model to use for Copilot CLI; can be changed with /model.",
      '    - "claude-sonnet-5"',
      '    - "gpt-5.5"',
      "",
      "  `contextTier`: context window tier.",
      '    - "not-a-model"',
    ].join("\n");
    expect(parseCopilotModelList(help)).toEqual([
      { id: "default", label: "Auto" },
      { id: "claude-sonnet-5", label: "claude-sonnet-5" },
      { id: "gpt-5.5", label: "gpt-5.5" },
    ]);
  });

  it("falls back to Auto when the help text has no model section", () => {
    expect(parseCopilotModelList("")).toEqual([{ id: "default", label: "Auto" }]);
  });
});

describe("copilotCliSpec", () => {
  it("disables tools and custom instructions and keeps a dash-leading prompt as one argument", () => {
    const { args } = copilotCliSpec.buildInvocation("gpt-5.5", {
      system: undefined,
      prompt: "-starts with dash",
    });
    expect(args[0]).toBe("--prompt=-starts with dash");
    expect(args).toEqual(
      expect.arrayContaining(["--available-tools=", "--no-custom-instructions", "--no-ask-user"]),
    );
    expect(args.some((arg) => arg.startsWith("--allow"))).toBe(false);
    expect(args.at(-1)).toBe("--model=gpt-5.5");
  });

  it("explains the real stderr from a policy-blocked account", () => {
    const stderr =
      "Error: Access denied by policy settings (Request ID: 32F8:361677)\n\nYour Copilot CLI policy setting may be preventing access.";
    expect(copilotCliSpec.describeFailure({ exitCode: 1, stderr, aborted: false })).toContain(
      "github.com/settings/copilot",
    );
  });
});
