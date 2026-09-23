import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import type { WorkspaceEntry, WorkspaceFile } from "../shared/types";

const MAX_VIEW_BYTES = 1_000_000;
const MAX_ENTRIES = 2_000;

// Resolves a path the renderer sent against the project folder and refuses anything outside it,
// including through symbolic links.
export async function insideProject(projectPath: string, relativePath: string): Promise<string> {
  const root = await realpath(projectPath);
  const target = await realpath(join(root, relativePath || ".")).catch(() => {
    throw new Error("That path does not exist.");
  });
  const rest = relative(root, target);
  if (rest.startsWith("..") || isAbsolute(rest)) {
    throw new Error("That path is outside the project folder.");
  }
  return target;
}

export async function listDirectory(
  projectPath: string,
  relativePath: string,
): Promise<WorkspaceEntry[]> {
  const directory = await insideProject(projectPath, relativePath);
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name !== ".git")
    .slice(0, MAX_ENTRIES)
    .map((entry) => ({
      name: entry.name,
      path: [relativePath, entry.name].filter(Boolean).join("/"),
      kind: entry.isDirectory() ? ("directory" as const) : ("file" as const),
    }))
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
    );
}

export async function readWorkspaceFile(
  projectPath: string,
  relativePath: string,
): Promise<WorkspaceFile> {
  const path = await insideProject(projectPath, relativePath);
  const info = await stat(path);
  if (!info.isFile()) throw new Error("That is not a file.");
  if (info.size > MAX_VIEW_BYTES)
    return { path: relativePath, content: null, reason: "File is larger than 1 MB." };
  const buffer = await readFile(path);
  if (buffer.includes(0)) return { path: relativePath, content: null, reason: "Binary file." };
  return { path: relativePath, content: buffer.toString("utf8"), reason: null };
}

// Build output and VCS metadata skipped when walking a project that has no Git repository to
// list files for instead.
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  ".next",
  "build",
  "target",
  ".venv",
]);

// Files under a project that isn't a Git repository, for `@` mentions when `git ls-files` has
// nothing to report. Symbolic links are not followed, so a link back into the tree can't loop.
export async function listAllFiles(projectPath: string, limit: number): Promise<string[]> {
  const root = await realpath(projectPath);
  const files: string[] = [];

  async function walk(directory: string, relativePath: string): Promise<void> {
    // A folder that can't be read is skipped, not allowed to empty the whole list.
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (entry.isSymbolicLink() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const entryPath = [relativePath, entry.name].filter(Boolean).join("/");
      if (entry.isDirectory()) await walk(join(directory, entry.name), entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }

  await walk(root, "");
  return files;
}

export interface TerminalEvents {
  output(id: string, text: string): void;
  exit(id: string, code: number | null): void;
}

// Runs one command and streams its output, for the Tests panel. The Terminal panel uses a real
// pseudo-terminal instead (pty-terminal.ts).
export function createTerminal(events: TerminalEvents, env: () => NodeJS.ProcessEnv) {
  const running = new Map<string, ChildProcess>();
  return {
    async run(projectPath: string, command: string): Promise<string> {
      const cwd = await insideProject(projectPath, "");
      const id = randomUUID();
      const [shell, ...flags] =
        process.platform === "win32"
          ? ["cmd.exe", "/d", "/s", "/c"]
          : [process.env["SHELL"] || "/bin/sh", "-c"];
      const child = spawn(shell ?? "/bin/sh", [...flags, command], {
        cwd,
        env: { ...env(), FORCE_COLOR: "0", NO_COLOR: "1", PAGER: "cat", GIT_PAGER: "cat" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      running.set(id, child);
      const forward = (chunk: Buffer) => events.output(id, chunk.toString("utf8"));
      child.stdout?.on("data", forward);
      child.stderr?.on("data", forward);
      child.on("error", (error) => {
        events.output(id, `${error.message}\n`);
      });
      child.on("close", (code) => {
        running.delete(id);
        events.exit(id, code);
      });
      return id;
    },

    stop(id: string): void {
      running.get(id)?.kill("SIGTERM");
    },

    stopAll(): void {
      for (const child of running.values()) child.kill("SIGTERM");
      running.clear();
    },
  };
}
