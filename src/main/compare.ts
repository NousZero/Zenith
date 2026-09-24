import { randomBytes } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { Comparison, ComparisonFile, GitWorktree } from "../shared/types";
import { createGitWorkspace, type GitRunner } from "./git";

const BRANCH_PREFIX = "zenith/compare/";
const COMPARISON_ID = /^[0-9a-f]{8}$/;
const MIN_RUNS = 2;
const MAX_RUNS = 3;
const NUL = String.fromCharCode(0);
// Diffs built to be applied, so the user's diff settings (no prefixes, external tools, text
// conversion, relative paths) must not change their shape.
const PATCH_ARGS = [
  "diff",
  "--cached",
  "--no-color",
  "--no-ext-diff",
  "--no-textconv",
  "--no-relative",
  "--no-renames",
  "--src-prefix=a/",
  "--dst-prefix=b/",
];

// Provider ids end up in branch and folder names, so only a plain slug of them is used.
export function runSlug(providerId: string): string {
  const slug = providerId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "assistant";
}

export function createComparisons(git: GitRunner, db: DatabaseSync) {
  const workspace = createGitWorkspace(git);
  // Comparisons not yet kept or discarded. Keep needs the base commit, and the window needs the
  // runs to reopen the comparison, so both are stored and survive a restart.
  const statements = {
    byId: db.prepare("SELECT project_path, base FROM comparisons WHERE id = ?"),
    list: db.prepare("SELECT id, project_path, base, runs FROM comparisons ORDER BY created_at"),
    insert: db.prepare(
      "INSERT INTO comparisons (id, project_path, base, runs, created_at) VALUES (?, ?, ?, ?, ?)",
    ),
    remove: db.prepare("DELETE FROM comparisons WHERE id = ?"),
  };
  interface Row {
    id: string;
    project_path: string;
    base: string;
    runs: string;
  }

  // A comparison's worktrees, read from Git itself so the window never names a folder or branch.
  async function runsOf(projectPath: string, id: string): Promise<GitWorktree[]> {
    if (!COMPARISON_ID.test(id)) throw new Error("That isn't a comparison Zenith started.");
    const prefix = `${BRANCH_PREFIX}${id}/`;
    return (await workspace.worktrees(projectPath)).filter((run) => run.branch.startsWith(prefix));
  }

  async function runOf(projectPath: string, id: string, providerId: string) {
    const known = statements.byId.get(id) as Pick<Row, "project_path" | "base"> | undefined;
    if (!known || known.project_path !== projectPath) {
      throw new Error("This comparison isn't running any more. Discard it and start again.");
    }
    const branch = `${BRANCH_PREFIX}${id}/${runSlug(providerId)}`;
    const run = (await runsOf(projectPath, id)).find((candidate) => candidate.branch === branch);
    if (!run) throw new Error(`The worktree for ${providerId} is gone.`);
    // Stages everything in the run's own worktree, so new and deleted files show in the diff.
    await git(["add", "-A"], { cwd: run.path });
    return { path: run.path, base: known.base };
  }

  async function discard(projectPath: string, id: string): Promise<string[]> {
    const leftovers: string[] = [];
    for (const run of await runsOf(projectPath, id)) {
      try {
        await git(["worktree", "remove", "--force", run.path], { cwd: projectPath });
      } catch {
        leftovers.push(run.path);
        continue;
      }
      await git(["branch", "-D", run.branch], { cwd: projectPath }).catch(() =>
        leftovers.push(`branch ${run.branch}`),
      );
    }
    statements.remove.run(id);
    return leftovers;
  }

  return {
    async start(projectPath: string, providerIds: string[]): Promise<Comparison> {
      const slugs = new Set(providerIds.map(runSlug));
      if (providerIds.length < MIN_RUNS || providerIds.length > MAX_RUNS) {
        throw new Error("Pick two or three assistants to compare.");
      }
      if (slugs.size !== providerIds.length) throw new Error("Pick different assistants.");
      const status = await workspace.status(projectPath);
      if (!status.isRepository) {
        throw new Error("Comparisons need a Git repository, and this folder isn't one.");
      }
      if (status.files.length > 0) {
        throw new Error(
          "Your project has uncommitted changes. Commit or stash them first: every assistant starts from the last commit.",
        );
      }
      const base = (
        await git(["rev-parse", "--verify", "HEAD"], { cwd: projectPath }).catch(() => {
          throw new Error("Make a first commit, then compare.");
        })
      ).trim();
      const id = randomBytes(4).toString("hex");
      const runs: Comparison["runs"] = [];
      try {
        for (const providerId of providerIds) {
          const branch = `${BRANCH_PREFIX}${id}/${runSlug(providerId)}`;
          const path = await workspace.addWorktree(projectPath, branch, base);
          runs.push({ providerId, branch, path });
        }
      } catch (error) {
        await discard(projectPath, id);
        throw error;
      }
      statements.insert.run(id, projectPath, base, JSON.stringify(runs), Date.now());
      return { id, projectPath, base, runs };
    },

    async changes(projectPath: string, id: string, providerId: string): Promise<ComparisonFile[]> {
      const { path, base } = await runOf(projectPath, id, providerId);
      const [numstat, diff] = await Promise.all([
        git([...PATCH_ARGS, "--numstat", "-z", base], { cwd: path }),
        git([...PATCH_ARGS, base], { cwd: path }),
      ]);
      // Both lists come out in the same order, one entry per file, since renames are off.
      const diffs = diff.split(/^(?=diff --git )/m).filter((part) => part.startsWith("diff --git"));
      return numstat
        .split(NUL)
        .filter(Boolean)
        .map((entry, index) => {
          const [added = "-", removed = "-", ...rest] = entry.split("\t");
          return {
            path: rest.join("\t"),
            added: added === "-" ? null : Number(added),
            removed: removed === "-" ? null : Number(removed),
            diff: diffs[index] ?? "",
          };
        });
    },

    // Applies one run's changes (new, changed and deleted files) to the project and stages them,
    // then removes every worktree of the comparison. Refuses if the project changed meanwhile.
    async keep(
      projectPath: string,
      id: string,
      providerId: string,
    ): Promise<{ applied: number; leftovers: string[] }> {
      const { path, base } = await runOf(projectPath, id, providerId);
      if ((await workspace.status(projectPath)).files.length > 0) {
        throw new Error(
          "Your project has changes made since the comparison started. Commit or stash them, then keep again.",
        );
      }
      const head = (await git(["rev-parse", "--verify", "HEAD"], { cwd: projectPath })).trim();
      if (head !== base) {
        throw new Error(
          "Your project is on a different commit than when the comparison started, so these changes may not fit. Go back to that commit, or discard the comparison.",
        );
      }
      const directory = await mkdtemp(join(tmpdir(), "zenith-compare-"));
      try {
        // Git writes the patch itself: a trip through a JavaScript string would mangle bytes
        // that aren't UTF-8.
        const patch = join(directory, "changes.patch");
        await git([...PATCH_ARGS, "--binary", `--output=${patch}`, base], { cwd: path });
        const names = await git([...PATCH_ARGS, "--name-only", "-z", base], { cwd: path });
        if ((await stat(patch)).size > 0) {
          // All or nothing: git apply checks every file before it changes any.
          await git(["apply", "--index", patch], { cwd: projectPath });
        }
        return {
          applied: names.split(NUL).filter(Boolean).length,
          leftovers: await discard(projectPath, id),
        };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },

    discard,

    // Comparisons still waiting for keep or discard, including ones from before a restart.
    unfinished(): Comparison[] {
      return (statements.list.all() as unknown as Row[]).map((row) => ({
        id: row.id,
        projectPath: row.project_path,
        base: row.base,
        runs: JSON.parse(row.runs) as Comparison["runs"],
      }));
    },

    // Worktrees of comparisons Zenith has no record of, e.g. from a start cut short by a quit.
    // ponytail: a recorded comparison whose session was deleted is neither reopened nor listed
    // here; list recorded ones too, marked as such, if that turns up.
    async leftovers(projectPath: string): Promise<{ id: string; paths: string[] }[]> {
      const found = new Map<string, string[]>();
      for (const worktree of await workspace.worktrees(projectPath)) {
        if (!worktree.branch.startsWith(BRANCH_PREFIX)) continue;
        const id = worktree.branch.slice(BRANCH_PREFIX.length).split("/")[0] ?? "";
        if (!COMPARISON_ID.test(id) || statements.byId.get(id)) continue;
        found.set(id, [...(found.get(id) ?? []), worktree.path]);
      }
      return [...found].map(([id, paths]) => ({ id, paths }));
    },
  };
}
