import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatFile } from "../../src/main/agent/format";
import { createLanguageServers } from "../../src/main/agent/lsp";
import { createMcpTools } from "../../src/main/agent/mcp-client";
import { launchable } from "../fixtures/windows-shim";

const fixtures = join(import.meta.dirname, "..", "fixtures");
const env = () => ({ PATH: process.env["PATH"] ?? "" });

describe("formatters, language servers, and MCP tools", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), "zenith-code-"));
  });

  afterEach(async () => {
    // Disposed servers get a second to exit, and Windows won't delete a running process's working
    // folder in the meantime, so the removal retries briefly.
    await rm(project, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  it("formats with the project's Prettier and reports only real changes", async () => {
    const file = join(project, "a.ts");
    await writeFile(file, "const  a=1\n");
    expect(await formatFile(project, file, env())).toBeUndefined();

    await mkdir(join(project, "node_modules", ".bin"), { recursive: true });
    // Stands in for `prettier --write <file>`; on Windows npm installs it as prettier.cmd.
    const prettier = join(
      project,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "prettier.js" : "prettier",
    );
    await writeFile(
      prettier,
      '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.argv[3], "const a = 1;\\n");\n',
    );
    await chmod(prettier, 0o755);
    launchable(prettier);
    expect(await formatFile(project, file, env())).toBe("Prettier");
    expect(await readFile(file, "utf8")).toBe("const a = 1;\n");
    expect(await formatFile(project, file, env())).toBeUndefined();
    expect(await formatFile(project, join(project, "notes.txt"), env())).toBeUndefined();
  });

  it("returns a language server's errors for a changed file", async () => {
    await chmod(join(fixtures, "fake-lsp-server.mjs"), 0o755);
    const servers = createLanguageServers(env, [
      // Not installed: the next candidate serves the file.
      {
        name: "absent",
        languages: { ".ts": "typescript" },
        command: "zenith-no-such-server",
        args: [],
      },
      {
        name: "fake-lsp",
        languages: { ".ts": "typescript" },
        command: launchable(join(fixtures, "fake-lsp-server.mjs")),
        args: [],
      },
    ]);
    const missing = createLanguageServers(env, [
      {
        name: "missing",
        languages: { ".ts": "typescript" },
        command: "zenith-no-such-server",
        args: [],
      },
    ]);
    try {
      const file = join(project, "src", "a.ts");
      expect(await servers.problems(project, file, "ok\nWARN\n")).toBe("");
      expect(await servers.problems(project, file, "ok\n  ERROR here\n")).toBe(
        "fake-lsp reports errors in this file:\nsrc/a.ts:2:3: Found ERROR",
      );
      expect(await servers.problems(project, join(project, "a.md"), "ERROR")).toBe("");
      expect(await missing.problems(project, file, "ERROR")).toBe("");

      const pulling = createLanguageServers(env, [
        {
          name: "pull-lsp",
          languages: { ".ts": "typescript" },
          command: launchable(join(fixtures, "fake-lsp-server.mjs")),
          args: ["--pull"],
        },
      ]);
      expect(await pulling.problems(project, file, "ERROR\n")).toBe(
        "pull-lsp reports errors in this file:\nsrc/a.ts:1:1: Found ERROR",
      );
      expect(await pulling.problems(project, file, "fine\n")).toBe("");
      pulling.dispose();
    } finally {
      servers.dispose();
      missing.dispose();
    }
  });

  it("lists and calls tools from an MCP server, including failures", async () => {
    await chmod(join(fixtures, "fake-mcp-server.mjs"), 0o755);
    let servers: Record<string, { command: string; args: string[]; env: Record<string, string> }> =
      {
        demo: {
          command: launchable(join(fixtures, "fake-mcp-server.mjs")),
          args: [],
          env: { GREETING: "hi" },
        },
        broken: { command: "zenith-no-such-mcp-server", args: [], env: {} },
      };
    const tools = createMcpTools({ servers: async () => servers, env, clientVersion: "test" });
    try {
      const extra = await tools.forProject(project);
      expect(extra.specs.map((spec) => spec.name)).toEqual(["mcp__demo__shout", "mcp__demo__fail"]);
      expect(await extra.call("mcp__demo__shout", { text: "hello" })).toBe("HELLO (hi)");
      await expect(extra.call("mcp__demo__fail", {})).rejects.toThrow("It broke.");
      await expect(extra.call("mcp__demo__nope", {})).rejects.toThrow("not available");

      servers = {};
      expect((await tools.forProject(project)).specs).toEqual([]);
      await expect(extra.call("mcp__demo__shout", { text: "x" })).rejects.toThrow("stopped");
    } finally {
      tools.dispose();
    }
  });
});
