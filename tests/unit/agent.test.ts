import { describe, expect, it } from "vitest";

import { toTaskEvent } from "../../src/main/acp/acp-adapter";
import {
  describeToolUse,
  isInside,
  parseTodos,
  proposedContent,
} from "../../src/main/agent/claude-agent";
import { parseMcpConfig } from "../../src/main/mcp-config";
import type { AgentActivity } from "../../src/shared/types";

describe("Claude Code agent helpers", () => {
  it("describes tool calls relative to the project", () => {
    expect(describeToolUse("Edit", { file_path: "/p/src/a.ts" }, "/p")).toBe("Edit src/a.ts");
    expect(describeToolUse("Read", { file_path: "/etc/hosts" }, "/p")).toBe("Read /etc/hosts");
    expect(describeToolUse("Bash", { command: "npm test" }, "/p")).toBe("Run npm test");
  });

  it("computes the file an edit or write would produce", () => {
    expect(proposedContent("Edit", { old_string: "a", new_string: "b" }, "a a")).toBe("b a");
    expect(
      proposedContent("Edit", { old_string: "a", new_string: "$&", replace_all: true }, "a a"),
    ).toBe("$& $&");
    expect(proposedContent("Write", { content: "new" }, "old")).toBe("new");
    expect(proposedContent("Bash", {}, "old")).toBeUndefined();
  });

  it("checks whether a path stays inside the project", () => {
    expect(isInside("/p", "/p/src/a.ts")).toBe(true);
    expect(isInside("/p", "src/a.ts")).toBe(true);
    expect(isInside("/p", "/p/../etc/hosts")).toBe(false);
    expect(isInside("/p", "/other")).toBe(false);
  });

  it("keeps only valid todos", () => {
    expect(
      parseTodos({
        todos: [
          { content: "Write tests", status: "in_progress", activeForm: "Writing tests" },
          { content: "Bad", status: "unknown" },
          "junk",
        ],
      }),
    ).toEqual([{ content: "Write tests", status: "in_progress" }]);
  });
});

describe("ACP task events", () => {
  it("tracks tool calls through their updates", () => {
    const known = new Map<string, AgentActivity>();
    expect(
      toTaskEvent(
        {
          sessionUpdate: "tool_call",
          toolCallId: "t1",
          title: "Read a.ts",
          kind: "read",
          status: "pending",
        },
        known,
      ),
    ).toEqual({ activity: { id: "t1", tool: "read", title: "Read a.ts", status: "running" } });
    expect(
      toTaskEvent(
        { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" },
        known,
      ),
    ).toEqual({
      activity: { id: "t1", tool: "read", title: "Read a.ts", status: "done" },
    });
  });

  it("turns a plan into todos", () => {
    expect(
      toTaskEvent(
        {
          sessionUpdate: "plan",
          entries: [{ content: "Step", status: "pending", priority: "high" }],
        },
        new Map(),
      ),
    ).toEqual({ todos: [{ content: "Step", status: "pending" }] });
  });
});

describe("parseMcpConfig", () => {
  it("accepts Claude-style server definitions and fills defaults", () => {
    expect(
      parseMcpConfig('{"mcpServers":{"files":{"command":"npx","args":["-y","srv"]}}}'),
    ).toEqual({
      files: { command: "npx", args: ["-y", "srv"], env: {} },
    });
    expect(parseMcpConfig("  ")).toEqual({});
  });

  it("explains what is wrong with an invalid config", () => {
    expect(() => parseMcpConfig("{")).toThrow("not valid JSON");
    expect(() => parseMcpConfig("{}")).toThrow('"mcpServers" object');
    expect(() => parseMcpConfig('{"mcpServers":{"x":{}}}')).toThrow('needs a "command"');
    expect(() => parseMcpConfig('{"mcpServers":{"bad name":{"command":"a"}}}')).toThrow(
      "may only use",
    );
  });
});

describe("agent tools and project context", () => {
  it("keeps only reading tools in plan mode and honors an agent's tool list", async () => {
    const { agentTools } = await import("../../src/main/agent/claude-agent");
    expect(agentTools({})).toEqual(["Read", "Write", "Edit", "Bash", "Glob", "Grep", "TodoWrite"]);
    expect(agentTools({ planMode: true })).toEqual(["Read", "Glob", "Grep", "TodoWrite"]);
    expect(agentTools({ allowedTools: ["Read", "Edit", "WebFetch"] })).toEqual([
      "Read",
      "Edit",
      "TodoWrite",
    ]);
    expect(agentTools({ planMode: true, allowedTools: ["Edit"] })).toEqual(["TodoWrite"]);
  });

  it("reads AGENTS.md and CLAUDE.md from the project", async () => {
    const { projectContext } = await import("../../src/main/agent/claude-agent");
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "zenith-context-"));
    try {
      expect(await projectContext(dir)).toBe("");
      await writeFile(join(dir, "AGENTS.md"), "Use pnpm.");
      await writeFile(join(dir, "CLAUDE.md"), "Prefer small diffs.");
      const context = await projectContext(dir);
      expect(context).toContain('<project-file name="AGENTS.md">\nUse pnpm.\n</project-file>');
      expect(context).toContain(
        '<project-file name="CLAUDE.md">\nPrefer small diffs.\n</project-file>',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
