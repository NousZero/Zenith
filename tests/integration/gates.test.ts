import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runGates } from "../../src/main/gates";
import { gateFixPrompt } from "../../src/shared/gates";
import type { GitStatus } from "../../src/shared/types";

const roots: string[] = [];

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zenith-gates-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, name), content, "utf8");
  }
  return root;
}

const status = (paths: string[]): GitStatus => ({
  isRepository: true,
  branch: "main",
  files: paths.map((path) => ({ path, state: "modified" as const, staged: false })),
});

const deps = (statusValue: GitStatus, problems = "", served = true) => ({
  gitStatus: () => Promise.resolve(statusValue),
  problems: () => Promise.resolve(problems),
  served: () => served,
});

afterEach(() => {
  roots.length = 0;
});

describe("gates", () => {
  it("finds a key a reply left in a changed file, and says which file and line", async () => {
    const root = await project({
      "config.ts": 'const client = new Client("sk-ant-api03-TSjP4x9fakekeyvalue000111222");\n',
    });

    const gates = await runGates(deps(status(["config.ts"])), root);
    const secrets = gates.find((gate) => gate.id === "secrets");

    expect(secrets?.state).toBe("fail");
    expect(secrets?.findings[0]).toContain("config.ts:1");
    expect(gateFixPrompt(gates)).toContain("config.ts:1");
  });

  it("passes clean files, ignores placeholders, and reads no file outside the change list", async () => {
    const root = await project({
      "ok.ts": 'const key = process.env["API_KEY"];\n',
      "docs.md": 'Set `API_KEY="your-key-here"` before starting.\n',
      "leaky.ts": 'const key = "sk-ant-api03-TSjP4x9fakekeyvalue000111222";\n',
    });

    const gates = await runGates(deps(status(["ok.ts", "docs.md"])), root);

    expect(gates.find((gate) => gate.id === "secrets")?.state).toBe("pass");
    expect(gateFixPrompt(gates)).toBe("");
  });

  it("reports language-server errors and a change that spread too far", async () => {
    const names = Array.from({ length: 16 }, (_, index) => `file${index}.ts`);
    const root = await project(Object.fromEntries(names.map((name) => [name, "export {};\n"])));

    const gates = await runGates(deps(status(names), "file0.ts:1:1: Cannot find name 'x'."), root);

    expect(gates.find((gate) => gate.id === "problems")?.state).toBe("fail");
    expect(gates.find((gate) => gate.id === "problems")?.findings[0]).toContain("Cannot find name");
    const scope = gates.find((gate) => gate.id === "scope");
    expect(scope?.state).toBe("fail");
    expect(scope?.detail).toContain("16 changed files");
  });

  it("says nothing either way without a repository or a language server", async () => {
    const root = await project({ "a.ts": "export {};\n" });

    const outside = await runGates(
      {
        gitStatus: () => Promise.resolve({ isRepository: false, branch: "", files: [] }),
        problems: () => Promise.resolve(""),
        served: () => true,
      },
      root,
    );
    expect(outside[0]?.state).toBe("skipped");

    const noServer = await runGates(deps(status(["a.ts"]), "", false), root);
    expect(noServer.find((gate) => gate.id === "problems")?.state).toBe("skipped");
    expect(noServer.find((gate) => gate.id === "secrets")?.state).toBe("pass");
  });
});
