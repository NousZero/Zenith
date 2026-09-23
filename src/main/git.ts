import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { unifiedDiff } from "../shared/diff";
import type { GitStatus, GitWorktree } from "../shared/types";

const GIT_TIMEOUT_MS = 60_000;
// Separator in `git ... -z` output.
const NUL = String.fromCharCode(0);
const MAX_BUFFER = 32 * 1024 * 1024;
// Never let repository configuration run programs while Zenith reads status in the background.
const SAFE_CONFIG = [
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.autocrlf=false",
  "-c",
  "diff.external=",
  "-c",
  "core.pager=cat",
];

// From Agamemnon's hardened Git inspector: background status and diffs must not take the index
// lock the user's own Git needs, follow replace refs, ask for credentials, or open a pager.
// Global config stays, since commits need the user's name and email.
export const SAFE_ENV: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "Never",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_PAGER: "cat",
  PAGER: "cat",
};

export type GitRunner = (
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) => Promise<string>;

export function createGitRunner(
  resolveGit: () => Promise<string | undefined>,
  env: () => NodeJS.ProcessEnv,
): GitRunner {
  return async (args, options) => {
    const git = await resolveGit();
    if (!git) throw new Error("Git is not installed on this computer.");
    return new Promise((resolveOutput, reject) => {
      execFile(
        git,
        [...SAFE_CONFIG, ...args],
        {
          cwd: options.cwd,
          env: { ...env(), ...SAFE_ENV, ...options.env },
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) reject(new Error(String(stderr).trim().split("\n").at(-1) || error.message));
          else resolveOutput(String(stdout));
        },
      );
    });
  };
}

// Parses `git status --porcelain=v1 -z`; renames carry the old path as a second entry.
export function parseStatus(output: string): GitStatus["files"] {
  const parts = output.split(NUL);
  const files: GitStatus["files"] = [];
  for (let index = 0; index < parts.length; index++) {
    const entry = parts[index] ?? "";
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (code.includes("R") || code.includes("C")) index++;
    const state =
      code === "??"
        ? "untracked"
        : code.includes("D")
          ? "deleted"
          : code.includes("A")
            ? "added"
            : code.includes("R")
              ? "renamed"
              : "modified";
    files.push({ path, state, staged: code[0] !== " " && code[0] !== "?" });
  }
  return files;
}

// Enough for `@` completion in large repositories without shipping a huge list to the renderer.
export const MAX_LISTED_FILES = 20_000;

export function createGitWorkspace(git: GitRunner) {
  return {
    // Project files Git knows or would add (ignored ones left out), for `@` mentions. Returns
    // nothing for a folder that isn't a Git repository; the workspace:files IPC handler falls
    // back to a full-folder walk in that case.
    async files(projectPath: string): Promise<string[]> {
      const output = await git(
        ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--deduplicate"],
        { cwd: projectPath },
      ).catch(() => "");
      return output.split(NUL).filter(Boolean).slice(0, MAX_LISTED_FILES);
    },

    async status(projectPath: string): Promise<GitStatus> {
      const inside = await git(["rev-parse", "--is-inside-work-tree"], { cwd: projectPath })
        .then((output) => output.trim() === "true")
        .catch(() => false);
      if (!inside) return { isRepository: false, branch: "", files: [] };
      const [branch, status] = await Promise.all([
        git(["symbolic-ref", "--short", "-q", "HEAD"], { cwd: projectPath }).catch(() => ""),
        git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: projectPath }),
      ]);
      return {
        isRepository: true,
        branch: branch.trim() || "(detached)",
        files: parseStatus(status),
      };
    },

    // Diff of one file against the last commit, or the whole file for new files.
    async diff(projectPath: string, path: string, state: string): Promise<string> {
      const absolute = resolve(projectPath, path);
      if (state === "untracked") {
        const content = await readFile(absolute, "utf8").catch(() => "");
        return unifiedDiff("", content, path);
      }
      const hasHead = await git(["rev-parse", "--verify", "-q", "HEAD"], { cwd: projectPath })
        .then(() => true)
        .catch(() => false);
      if (!hasHead) {
        return unifiedDiff("", await readFile(absolute, "utf8").catch(() => ""), path);
      }
      return git(["diff", "--no-ext-diff", "--no-color", "HEAD", "--", path], { cwd: projectPath });
    },

    // Stages everything and commits. Runs the repository's own commit hooks, as `git commit` does.
    async commit(projectPath: string, message: string): Promise<string> {
      if (message.trim() === "") throw new Error("Write a commit message first.");
      await git(["add", "-A"], { cwd: projectPath });
      await git(["commit", "-m", message], { cwd: projectPath });
      return (await git(["rev-parse", "--short", "HEAD"], { cwd: projectPath })).trim();
    },

    async worktrees(projectPath: string): Promise<GitWorktree[]> {
      const output = await git(["worktree", "list", "--porcelain"], { cwd: projectPath }).catch(
        () => "",
      );
      return output
        .split("\n\n")
        .map((block) => {
          const lines = block.split("\n");
          const path = lines.find((line) => line.startsWith("worktree "))?.slice(9) ?? "";
          const branch =
            lines
              .find((line) => line.startsWith("branch "))
              ?.slice(7)
              .replace("refs/heads/", "") ?? "";
          return { path, branch: branch || "(detached)" };
        })
        .filter((worktree) => worktree.path !== "");
    },

    // Creates a sibling folder "<project>-<branch>" on a new branch.
    async addWorktree(projectPath: string, branch: string): Promise<string> {
      await git(["check-ref-format", "--branch", branch], { cwd: projectPath }).catch(() => {
        throw new Error(`"${branch}" is not a valid branch name.`);
      });
      const target = join(
        dirname(projectPath),
        `${basename(projectPath)}-${branch.replaceAll("/", "-")}`,
      );
      await git(["worktree", "add", "-b", branch, target], { cwd: projectPath });
      return target;
    },
  };
}

// Snapshots of a project's files before each agent reply, in a Git database of Zenith's own,
// so undo also covers changes made by shell commands and by other agents.
export function createSnapshotStore(options: {
  db: DatabaseSync;
  git: GitRunner;
  directory: string;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const statements = {
    save: options.db.prepare(
      "INSERT OR REPLACE INTO turn_snapshots (turn_id, project_path, git_dir, tree, created_at) VALUES (?, ?, ?, ?, ?)",
    ),
    get: options.db.prepare(
      "SELECT project_path, git_dir, tree FROM turn_snapshots WHERE turn_id = ?",
    ),
    remove: options.db.prepare("DELETE FROM turn_snapshots WHERE turn_id = ?"),
  };

  const gitDirFor = (projectPath: string) =>
    join(options.directory, Buffer.from(resolve(projectPath)).toString("base64url").slice(-80));

  async function ensureRepository(gitDir: string) {
    await mkdir(gitDir, { recursive: true });
    const exclude = join(gitDir, "info", "exclude");
    const existing = await readFile(exclude, "utf8").catch(() => undefined);
    if (existing === undefined) {
      await options.git(["--git-dir", gitDir, "init", "-q"], { cwd: options.directory });
      await mkdir(dirname(exclude), { recursive: true });
      await writeFile(
        exclude,
        ["node_modules/", ".git/", "dist/", "build/", "out/", ".vite/", ""].join("\n"),
      );
    }
  }

  const inTree = (gitDir: string, projectPath: string, args: string[]) =>
    options.git(["--git-dir", gitDir, "--work-tree", projectPath, ...args], { cwd: projectPath });

  return {
    async take(turnId: string, projectPath: string): Promise<boolean> {
      const gitDir = gitDirFor(projectPath);
      try {
        await ensureRepository(gitDir);
        await inTree(gitDir, projectPath, ["add", "-A", "--", "."]);
        const tree = (await inTree(gitDir, projectPath, ["write-tree"])).trim();
        statements.save.run(turnId, projectPath, gitDir, tree, now());
        return true;
      } catch (error) {
        console.error(`Snapshot of ${projectPath} failed:`, error);
        return false;
      }
    },

    has(turnId: string): boolean {
      return statements.get.get(turnId) !== undefined;
    },

    // Puts every file back as it was when the snapshot was taken; returns the paths that changed.
    async restore(turnId: string): Promise<string[]> {
      const row = statements.get.get(turnId) as
        { project_path: string; git_dir: string; tree: string } | undefined;
      if (!row) return [];
      const { project_path: projectPath, git_dir: gitDir, tree } = row;
      await inTree(gitDir, projectPath, ["add", "-A", "--", "."]);
      const changed = (
        await inTree(gitDir, projectPath, ["diff-index", "--cached", "--name-only", "-z", tree])
      )
        .split(NUL)
        .filter(Boolean);
      const created = (
        await inTree(gitDir, projectPath, [
          "diff-index",
          "--cached",
          "--name-only",
          "-z",
          "--diff-filter=A",
          tree,
        ])
      )
        .split(NUL)
        .filter(Boolean);
      for (const path of created) await rm(resolve(projectPath, path), { force: true });
      await inTree(gitDir, projectPath, ["read-tree", tree]);
      await inTree(gitDir, projectPath, ["checkout-index", "-a", "-f"]);
      statements.remove.run(turnId);
      return changed;
    },

    // Restores one path from the snapshot tree, leaving the rest of the snapshot in place so
    // Undo all can still restore whatever wasn't undone here. False when the turn has no snapshot.
    async restoreFile(turnId: string, relativePath: string): Promise<boolean> {
      const row = statements.get.get(turnId) as
        { project_path: string; git_dir: string; tree: string } | undefined;
      if (!row) return false;
      const { project_path: projectPath, git_dir: gitDir, tree } = row;
      const existedInTree = await inTree(gitDir, projectPath, [
        "cat-file",
        "-e",
        `${tree}:${relativePath}`,
      ])
        .then(() => true)
        .catch(() => false);
      if (existedInTree) {
        await inTree(gitDir, projectPath, ["checkout", tree, "--", relativePath]);
        return true;
      }
      // Snapshots leave ignored files out, so an ignored path missing from the tree may well
      // have existed before the reply (a .env, say). Only a path Git would have kept is deleted.
      const ignored = await inTree(gitDir, projectPath, ["check-ignore", "-q", "--", relativePath])
        .then(() => true)
        .catch(() => false);
      if (ignored) return false;
      await rm(resolve(projectPath, relativePath), { force: true });
      return true;
    },
  };
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
