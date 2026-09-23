import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A throwaway Git repo with one committed README.md, so each test gets its own
// project folder and undo has a known baseline to restore to.
export function createGitProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "zenith-e2e-project-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "e2e@example.com");
  git("config", "user.name", "Zenith E2E");
  writeFileSync(join(dir, "README.md"), "# demo\n", "utf8");
  git("add", "README.md");
  git("commit", "-q", "-m", "initial");
  return dir;
}
