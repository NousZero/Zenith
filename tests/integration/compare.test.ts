import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createComparisons, runSlug } from "../../src/main/compare";
import { createGitRunner } from "../../src/main/git";

const env = () => ({
  PATH: process.env["PATH"] ?? "",
  HOME: process.env["HOME"] ?? "",
  GIT_AUTHOR_NAME: "Zenith Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Zenith Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
});
const git = createGitRunner(async () => "git", env);

describe("side-by-side comparisons", () => {
  let dir: string;
  let project: string;
  const run = (...args: string[]) =>
    execFileSync("git", args, { cwd: project, env: { ...process.env, ...env() } }).toString();

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-compare-"));
    project = join(dir, "project");
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "README.md"), "# demo\n");
    await writeFile(join(project, "src", "old.txt"), "old\n");
    run("-c", "init.defaultBranch=main", "init", "-q");
    run("add", "-A");
    run("commit", "-q", "-m", "first");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("makes plain slugs of provider ids", () => {
    expect(runSlug("claude-code")).toBe("claude-code");
    expect(runSlug("custom:My Model/../x")).toBe("custom-my-model-x");
    expect(runSlug("::")).toBe("assistant");
  });

  it("creates one worktree per assistant from HEAD, keeps one, and removes them all", async () => {
    const comparisons = createComparisons(git);
    const base = run("rev-parse", "HEAD").trim();
    const started = await comparisons.start(project, ["claude-code", "gemini-cli"]);

    expect(started.base).toBe(base);
    expect(started.runs.map((item) => item.branch)).toEqual([
      `zenith/compare/${started.id}/claude-code`,
      `zenith/compare/${started.id}/gemini-cli`,
    ]);
    const [claude, gemini] = started.runs;
    if (!claude || !gemini) throw new Error("Expected two runs.");
    expect(await readFile(join(claude.path, "README.md"), "utf8")).toBe("# demo\n");

    // Claude modifies, creates and deletes; Gemini changes something else.
    await writeFile(join(claude.path, "README.md"), "# demo\n\nnotes\n");
    await writeFile(join(claude.path, "src", "new.bin"), Buffer.from([0, 159, 146, 150, 255]));
    await unlink(join(claude.path, "src", "old.txt"));
    await writeFile(join(gemini.path, "README.md"), "# gemini\n");

    const changes = await comparisons.changes(project, started.id, "claude-code");
    expect(changes.map(({ path, added, removed }) => [path, added, removed])).toEqual([
      ["README.md", 2, 0],
      ["src/new.bin", null, null],
      ["src/old.txt", 0, 1],
    ]);
    expect(changes[0]?.diff).toContain("+notes");
    // Looking at changes leaves the user's project alone.
    expect(run("status", "--porcelain")).toBe("");

    expect(await comparisons.keep(project, started.id, "claude-code")).toEqual({
      applied: 3,
      leftovers: [],
    });
    expect(await readFile(join(project, "README.md"), "utf8")).toBe("# demo\n\nnotes\n");
    expect([...(await readFile(join(project, "src", "new.bin")))]).toEqual([0, 159, 146, 150, 255]);
    expect(existsSync(join(project, "src", "old.txt"))).toBe(false);
    // Applied and staged, not committed.
    expect(run("rev-parse", "HEAD").trim()).toBe(base);
    expect(run("diff", "--cached", "--name-only").trim().split("\n")).toEqual([
      "README.md",
      "src/new.bin",
      "src/old.txt",
    ]);

    expect(existsSync(claude.path)).toBe(false);
    expect(existsSync(gemini.path)).toBe(false);
    expect(run("branch", "--list", "zenith/*").trim()).toBe("");
  });

  it("refuses to start in a dirty project or outside Git", async () => {
    const comparisons = createComparisons(git);
    await writeFile(join(project, "README.md"), "# edited\n");
    await expect(comparisons.start(project, ["claude-code", "gemini-cli"])).rejects.toThrow(
      /uncommitted changes/,
    );
    await expect(comparisons.start(project, ["claude-code"])).rejects.toThrow(/two or three/);

    const plain = join(dir, "plain");
    await mkdir(plain);
    await expect(comparisons.start(plain, ["claude-code", "gemini-cli"])).rejects.toThrow(
      /Git repository/,
    );
  });

  it("refuses to keep when the project is dirty or has moved, and discard cleans up", async () => {
    const comparisons = createComparisons(git);
    const started = await comparisons.start(project, ["claude-code", "copilot-cli"]);
    const claude = started.runs[0];
    if (!claude) throw new Error("Expected a run.");
    await writeFile(join(claude.path, "README.md"), "# from claude\n");

    await writeFile(join(project, "scratch.txt"), "mine\n");
    await expect(comparisons.keep(project, started.id, "claude-code")).rejects.toThrow(
      /changes made since the comparison started/,
    );

    run("add", "-A");
    run("commit", "-q", "-m", "moved on");
    await expect(comparisons.keep(project, started.id, "claude-code")).rejects.toThrow(
      /different commit/,
    );
    // Nothing was applied and the worktrees are still there to discard.
    expect(await readFile(join(project, "README.md"), "utf8")).toBe("# demo\n");
    expect(existsSync(claude.path)).toBe(true);

    expect(await comparisons.discard(project, started.id)).toEqual([]);
    expect(started.runs.every((item) => !existsSync(item.path))).toBe(true);
    expect(run("branch", "--list", "zenith/*").trim()).toBe("");
    // A name the main process didn't make is refused rather than looked up.
    await expect(comparisons.discard(project, "../../x")).rejects.toThrow(/isn't a comparison/);
  });

  it("finds worktrees an earlier run of Zenith left behind", async () => {
    const started = await createComparisons(git).start(project, ["claude-code", "gemini-cli"]);
    // A fresh instance stands in for Zenith after a restart.
    const restarted = createComparisons(git);
    const leftovers = await restarted.leftovers(project);
    expect(leftovers.map((item) => [item.id, item.paths.length])).toEqual([[started.id, 2]]);
    await expect(restarted.keep(project, started.id, "claude-code")).rejects.toThrow(
      /isn't running any more/,
    );
    expect(await restarted.discard(project, started.id)).toEqual([]);
    expect(await restarted.leftovers(project)).toEqual([]);
  });
});
