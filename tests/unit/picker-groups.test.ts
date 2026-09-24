import { describe, expect, it } from "vitest";

import { pickerGroups, rememberConnectionLabels } from "../../src/renderer/providers";
import type { ConnectionStatus } from "../../src/shared/types";

const status = (
  id: string,
  kind: ConnectionStatus["kind"],
  state: ConnectionStatus["state"],
): ConnectionStatus => ({ id, label: id, kind, state, detail: "" });

const connections: ConnectionStatus[] = [
  status("claude-code", "cli", "ready"),
  status("gemini-cli", "cli", "sign-in-required"),
  status("copilot-cli", "cli", "not-installed"),
  status("hermes", "agent", "not-installed"),
  status("opencode", "agent", "not-installed"),
  status("goose", "agent", "ready"),
  status("ollama", "local", "not-running"),
  status("lmstudio", "local", "not-running"),
  status("my-api", "api-key", "ready"),
];

const ids = (result: ReturnType<typeof pickerGroups>) =>
  result.groups.map((group) => [group.label, group.providers.map((p) => p.id)]);

describe("pickerGroups", () => {
  it("lists only ready providers, grouped, and counts the rest in one entry", () => {
    rememberConnectionLabels(connections);
    const result = pickerGroups(connections, "claude-code");
    expect(ids(result)).toEqual([
      ["On this computer", ["claude-code"]],
      ["Agents", ["goose"]],
      ["API providers", ["my-api"]],
    ]);
    // Gemini, Copilot, Ollama, LM Studio, Hermes, and OpenCode.
    expect(result.more).toBe("More assistants (6)…");
  });

  it("keeps the current provider listed even when it is not ready", () => {
    const result = pickerGroups(connections, "gemini-cli");
    expect(ids(result)[0]).toEqual(["On this computer", ["claude-code", "gemini-cli"]]);
    expect(result.more).toBe("More assistants (5)…");
  });

  it("keeps a current agent that has since disappeared from the connection list", () => {
    rememberConnectionLabels([status("kimi", "agent", "ready")]);
    const result = pickerGroups(connections, "kimi");
    expect(ids(result)[1]).toEqual(["Agents", ["goose", "kimi"]]);
  });

  it("offers no extra entry when everything is ready", () => {
    const everything = pickerGroups(
      ["claude-code", "gemini-cli", "copilot-cli", "ollama", "lmstudio", "hermes", "opencode"].map(
        (id) => status(id, "cli", "ready"),
      ),
      "claude-code",
    );
    expect(everything.more).toBeNull();
  });

  it("falls back to the always-listed providers and a setup entry when nothing is ready", () => {
    const none = connections.map((connection) => ({
      ...connection,
      state: "not-installed" as const,
    }));
    const result = pickerGroups(none, "claude-code");
    expect(ids(result)[0]).toEqual([
      "On this computer",
      ["claude-code", "gemini-cli", "copilot-cli", "ollama", "lmstudio"],
    ]);
    expect(ids(result)[1]).toEqual(["Agents", ["hermes", "opencode", "goose"]]);
    expect(result.more).toBe("Set up an assistant…");
  });
});
