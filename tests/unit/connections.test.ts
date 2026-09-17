import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  apiKeyConnections,
  detectToolConnections,
  type ConnectionProbes,
} from "../../src/main/connections";

function probes(overrides: Partial<ConnectionProbes> = {}): ConnectionProbes {
  return {
    resolveBinary: async (name) => `/bin/${name}`,
    runCommand: async (_binary, args) => {
      if (args[0] === "auth") return { stdout: '{"loggedIn": true}', exitCode: 0 };
      return { stdout: "2.1.270 (Claude Code)", exitCode: 0 };
    },
    fetchLocalModels: async () => [{ id: "qwen2.5vl:7b", label: "qwen2.5vl:7b" }],
    fileExists: async () => false,
    readJsonFile: async () => ({}),
    env: {},
    home: "/home/user",
    join,
    ...overrides,
  };
}

function byId(statuses: Awaited<ReturnType<typeof detectToolConnections>>, id: string) {
  const status = statuses.find((entry) => entry.id === id);
  if (!status) throw new Error(`missing ${id}`);
  return status;
}

describe("detectToolConnections", () => {
  it("lists extra ACP agents only when installed, without starting them", async () => {
    const asked: string[] = [];
    const statuses = await detectToolConnections(
      probes({
        resolveBinary: async (name) =>
          ["goose", "codex-acp", "hermes", "claude"].includes(name) ? `/bin/${name}` : undefined,
        runCommand: async (binary, args) => {
          asked.push(binary);
          return { stdout: args[0] === "auth" ? '{"loggedIn": true}' : "1.2.3", exitCode: 0 };
        },
      }),
    );
    const agents = statuses.filter((status) => status.kind === "agent");
    expect(agents.map((agent) => [agent.id, agent.state])).toEqual([
      ["hermes", "ready"],
      ["opencode", "not-installed"],
      ["goose", "ready"],
      ["codex", "ready"],
    ]);
    // Only the always-listed agents are asked for a version.
    expect(asked).not.toContain("/bin/goose");
    expect(asked).not.toContain("/bin/codex-acp");
    expect(byId(statuses, "goose").detail).toContain("Goose ·");
  });

  it("reports installed, signed-in tools and running servers as ready", async () => {
    const statuses = await detectToolConnections(probes({ env: { GEMINI_API_KEY: "set" } }));
    expect(byId(statuses, "claude-code")).toMatchObject({
      state: "ready",
      detail: "Claude Code 2.1.270 · signed in",
    });
    expect(byId(statuses, "gemini-cli").state).toBe("ready");
    expect(byId(statuses, "copilot-cli").state).toBe("ready");
    expect(byId(statuses, "ollama")).toMatchObject({ state: "ready", detail: "Running · 1 model" });
  });

  it("explains missing tools, missing sign-in, and stopped servers", async () => {
    const statuses = await detectToolConnections(
      probes({
        resolveBinary: async (name) => (name === "copilot" ? undefined : `/bin/${name}`),
        runCommand: async (_binary, args) =>
          args[0] === "auth"
            ? { stdout: '{"loggedIn": false}', exitCode: 1 }
            : { stdout: "0.44.1", exitCode: 0 },
        fetchLocalModels: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    );
    expect(byId(statuses, "claude-code").state).toBe("sign-in-required");
    expect(byId(statuses, "gemini-cli")).toMatchObject({
      state: "sign-in-required",
      detail: "Gemini CLI 0.44.1 · run `gemini` in a terminal to sign in",
    });
    expect(byId(statuses, "copilot-cli")).toMatchObject({ state: "not-installed" });
    expect(byId(statuses, "lmstudio").state).toBe("not-running");
  });

  it("treats Gemini as signed in from settings or an OAuth file without reading the file", async () => {
    const oauthPath = join("/home/user", ".gemini", "oauth_creds.json");
    const readPaths: string[] = [];
    const statuses = await detectToolConnections(
      probes({
        fileExists: async (path) => path === oauthPath,
        readJsonFile: async (path) => {
          readPaths.push(path);
          return {};
        },
      }),
    );
    expect(byId(statuses, "gemini-cli").state).toBe("ready");
    expect(readPaths).not.toContain(oauthPath);
  });
});

describe("apiKeyConnections", () => {
  it("marks providers with saved keys as ready", () => {
    const statuses = apiKeyConnections(["anthropic"]);
    expect(statuses.find((s) => s.id === "anthropic")?.state).toBe("ready");
    expect(statuses.find((s) => s.id === "openai")?.state).toBe("needs-key");
  });
});
