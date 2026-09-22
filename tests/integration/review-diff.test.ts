import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import type { GitRunner } from "../../src/main/git";
import { collectDiff } from "../../src/main/review";

const run = promisify(execFile);
const git: GitRunner = async (args, options) =>
  (await run("git", args, { cwd: options.cwd })).stdout;

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zenith-review-"));
  await run("git", ["init", "-q"], { cwd: root });
  await run("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await run("git", ["config", "user.name", "Test"], { cwd: root });
  await writeFile(join(root, "app.ts"), "export const port = 3000;\n", "utf8");
  await run("git", ["add", "-A"], { cwd: root });
  await run("git", ["commit", "-qm", "first"], { cwd: root });
  return root;
}

describe("collectDiff", () => {
  it("covers changed and new files, and is empty on a clean tree", async () => {
    const root = await repository();
    expect(await collectDiff(git, root)).toBe("");

    await writeFile(join(root, "app.ts"), 'export const port = 3000;\nrun("rm -rf " + input);\n');
    await writeFile(join(root, "secret.ts"), 'export const key = "sk-live-000";\n');

    const diff = await collectDiff(git, root);

    expect(diff).toContain("app.ts");
    expect(diff).toContain('+run("rm -rf " + input);');
    expect(diff).toContain("+++ b/secret.ts");
    expect(diff).toContain('+export const key = "sk-live-000";');
  });
});
