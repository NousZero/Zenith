import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../src/main/database";
import {
  createGitRunner,
  createGitWorkspace,
  createSnapshotStore,
  parseStatus,
} from "../../src/main/git";
import {
  createTerminal,
  insideProject,
  listAllFiles,
  listDirectory,
  readWorkspaceFile,
} from "../../src/main/workspace";

const env = () => ({
  PATH: process.env["PATH"] ?? "",
  HOME: process.env["HOME"] ?? "",
  GIT_AUTHOR_NAME: "Zenith Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Zenith Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
});
const git = createGitRunner(async () => "git", env);

describe("workspace, Git, and snapshots", () => {
  let dir: string;
  let project: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-workspace-"));
    project = join(dir, "project");
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "src", "a.txt"), "one\n");
    await writeFile(join(project, "keep.txt"), "keep\n");
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("parses porcelain status including renames", () => {
    const nul = String.fromCharCode(0);
    expect(
      parseStatus([" M a.ts", "?? b.ts", "R  new.ts", "old.ts", "D  gone.ts", ""].join(nul)),
    ).toEqual([
      { path: "a.ts", state: "modified", staged: false },
      { path: "b.ts", state: "untracked", staged: false },
      { path: "new.ts", state: "renamed", staged: true },
      { path: "gone.ts", state: "deleted", staged: true },
    ]);
  });

  it("reports status and diffs, commits, and creates worktrees", async () => {
    const workspace = createGitWorkspace(git);
    expect(await workspace.status(project)).toEqual({ isRepository: false, branch: "", files: [] });

    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q"], { cwd: project });
    const untracked = await workspace.status(project);
    expect(untracked.branch).toBe("main");
    expect(untracked.files.map((file) => [file.path, file.state])).toEqual([
      ["keep.txt", "untracked"],
      ["src/a.txt", "untracked"],
    ]);
    expect(await workspace.diff(project, "src/a.txt", "untracked")).toContain("+one");

    const hash = await workspace.commit(project, "first");
    expect(hash).toMatch(/^[0-9a-f]{7,}$/);
    await writeFile(join(project, "src", "a.txt"), "two\n");
    const modified = await workspace.status(project);
    expect(modified.files).toEqual([{ path: "src/a.txt", state: "modified", staged: false }]);
    const diff = await workspace.diff(project, "src/a.txt", "modified");
    expect(diff).toContain("-one");
    expect(diff).toContain("+two");
    await expect(workspace.commit(project, "  ")).rejects.toThrow("commit message");

    const target = await workspace.addWorktree(project, "feature/x");
    expect(target).toBe(join(dir, "project-feature-x"));
    const worktrees = await workspace.worktrees(project);
    expect(worktrees.map((worktree) => worktree.branch)).toEqual(["main", "feature/x"]);
    await expect(workspace.addWorktree(project, "bad..name")).rejects.toThrow("not a valid branch");
  });

  it.skipIf(process.platform === "win32")(
    "runs Git with prompts, pagers, optional locks, and replace refs turned off",
    async () => {
      const fake = join(dir, "fake-git.sh");
      await writeFile(
        fake,
        '#!/bin/sh\necho "$GIT_TERMINAL_PROMPT $GCM_INTERACTIVE $GIT_OPTIONAL_LOCKS $GIT_NO_REPLACE_OBJECTS $GIT_PAGER"\n',
        { mode: 0o755 },
      );
      const runner = createGitRunner(
        async () => fake,
        () => ({ PATH: process.env["PATH"] ?? "" }),
      );
      expect((await runner(["status"], { cwd: dir })).trim()).toBe("0 Never 0 1 cat");
    },
  );

  it("lists project files for mentions, leaving ignored ones out", async () => {
    const workspace = createGitWorkspace(git);
    expect(await workspace.files(project)).toEqual([]);
    execFileSync("git", ["init", "-q"], { cwd: project });
    await writeFile(join(project, ".gitignore"), "secret.env\n");
    await writeFile(join(project, "secret.env"), "KEY=1\n");
    expect((await workspace.files(project)).sort()).toEqual([
      ".gitignore",
      "keep.txt",
      "src/a.txt",
    ]);
  });

  it("walks a non-Git folder for mentions, skipping build output and symlinked directories", async () => {
    await mkdir(join(project, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(project, "node_modules", "pkg", "index.js"), "");
    await symlink(dir, join(project, "escape"));
    expect((await listAllFiles(project, 20_000)).sort()).toEqual(["keep.txt", "src/a.txt"]);
  });

  it("restores files changed, created, and deleted after a snapshot", async () => {
    const snapshots = createSnapshotStore({ db, git, directory: join(dir, "snapshots") });
    expect(await snapshots.take("turn-1", project)).toBe(true);
    expect(snapshots.has("turn-1")).toBe(true);

    // What a shell command might do: edit, create, and delete files.
    await writeFile(join(project, "src", "a.txt"), "changed by a command\n");
    await writeFile(join(project, "created.txt"), "new\n");
    await rm(join(project, "keep.txt"));

    const changed = await snapshots.restore("turn-1");
    expect(changed.sort()).toEqual(["created.txt", "keep.txt", "src/a.txt"]);
    expect(await readFile(join(project, "src", "a.txt"), "utf8")).toBe("one\n");
    expect(await readFile(join(project, "keep.txt"), "utf8")).toBe("keep\n");
    await expect(readFile(join(project, "created.txt"), "utf8")).rejects.toThrow();
    expect(snapshots.has("turn-1")).toBe(false);

    // The project's own repository is untouched by snapshots.
    await expect(readFile(join(project, ".git", "HEAD"), "utf8")).rejects.toThrow();
  });

  it("restores one path from a snapshot, leaving the rest for a later Undo all", async () => {
    const snapshots = createSnapshotStore({ db, git, directory: join(dir, "snapshots") });
    expect(await snapshots.take("turn-1", project)).toBe(true);

    await writeFile(join(project, "src", "a.txt"), "changed by a command\n");
    await writeFile(join(project, "created.txt"), "new\n");

    expect(await snapshots.restoreFile("turn-1", "src/a.txt")).toBe(true);
    expect(await readFile(join(project, "src", "a.txt"), "utf8")).toBe("one\n");
    // A file the reply created has no place in the tree, so it's deleted rather than checked out.
    expect(await snapshots.restoreFile("turn-1", "created.txt")).toBe(true);
    await expect(readFile(join(project, "created.txt"), "utf8")).rejects.toThrow();
    // The snapshot itself is untouched, so a whole-turn restore is still possible afterward.
    expect(snapshots.has("turn-1")).toBe(true);
    expect(await snapshots.restore("turn-1")).toEqual([]);

    expect(await snapshots.restoreFile("no-such-turn", "src/a.txt")).toBe(false);
  });

  it("keeps file access inside the project folder", async () => {
    await symlink(dir, join(project, "escape"));
    await expect(insideProject(project, "../")).rejects.toThrow("outside the project");
    await expect(insideProject(project, "escape")).rejects.toThrow("outside the project");
    await expect(listDirectory(project, "")).resolves.toEqual([
      // Symbolic links are listed as files; opening one that leaves the project fails.
      { name: "src", path: "src", kind: "directory" },
      { name: "escape", path: "escape", kind: "file" },
      { name: "keep.txt", path: "keep.txt", kind: "file" },
    ]);
    await writeFile(join(project, "bin.dat"), Buffer.from([0, 1, 2]));
    await expect(readWorkspaceFile(project, "bin.dat")).resolves.toEqual({
      path: "bin.dat",
      content: null,
      reason: "Binary file.",
    });
    await expect(readWorkspaceFile(project, "src/a.txt")).resolves.toMatchObject({
      content: "one\n",
    });
  });

  it("runs terminal commands in the project and streams their output", async () => {
    const output: string[] = [];
    const exit = new Promise<number | null>((resolve) => {
      const terminal = createTerminal(
        { output: (_id, text) => output.push(text), exit: (_id, code) => resolve(code) },
        env,
      );
      void terminal.run(project, "ls && echo done");
    });
    expect(await exit).toBe(0);
    expect(output.join("")).toContain("keep.txt");
    expect(output.join("")).toContain("done");
  });
});
