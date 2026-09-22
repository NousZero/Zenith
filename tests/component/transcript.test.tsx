import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { AgentPanel } from "../../src/renderer/AgentPanel";
import { Composer } from "../../src/renderer/Composer";
import { POSTURES } from "../../src/shared/permissions";
import type { PaneState } from "../../src/shared/types";

const pane: PaneState = {
  id: "pane-1",
  name: "Conversation",
  providerId: "claude-code",
  modelId: "default",
  included: true,
  memoryEnabled: false,
  messages: [],
  promptTokens: 0,
  completionTokens: 0,
  lastError: null,
  contextWindow: null,
  projectPath: "/tmp/demo-project",
  agentPath: null,
  planMode: false,
};

beforeEach(() => {
  Object.defineProperty(window, "zenith", {
    configurable: true,
    value: {
      sandbox: { status: vi.fn().mockResolvedValue({ available: null, enabled: false }) },
      permissions: { get: vi.fn().mockResolvedValue(POSTURES[1]?.rules ?? "") },
    },
  });
});

test("a command reads as a terminal line, with its result under it", () => {
  render(
    <AgentPanel
      streaming
      turn={{
        turnId: "turn-1",
        todos: [],
        rolledBack: null,
        snapshot: true,
        activities: [
          {
            id: "call-1",
            tool: "Bash",
            title: "Run in sandbox: npm test",
            status: "failed",
            detail: "1 test failed",
          },
        ],
      }}
      onRollback={() => Promise.resolve()}
    />,
  );

  expect(screen.getByText("Run")).toBeInTheDocument();
  expect(screen.getByText("in sandbox")).toBeInTheDocument();
  expect(screen.getByText("npm test")).toBeInTheDocument();
  expect(screen.getByText("1 test failed")).toBeInTheDocument();
});

test("the composer states what a send will do, and queues while a reply is running", async () => {
  render(
    <Composer
      panes={[pane]}
      readyProviders={["claude-code"]}
      commands={[]}
      prompt="keep going"
      streaming
      queued="fix the build"
      onPromptChange={() => undefined}
      onSend={() => undefined}
      onStop={() => undefined}
      onCancelQueue={() => undefined}
    />,
  );

  expect(screen.getByText("Claude Code")).toBeInTheDocument();
  expect(screen.getByText("demo-project")).toBeInTheDocument();
  expect(await screen.findByText("standard")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Queue" })).toBeInTheDocument();
  expect(screen.getByText("Queued · fix the build")).toBeInTheDocument();
});
