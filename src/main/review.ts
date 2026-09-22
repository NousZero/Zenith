import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { GitRunner } from "./git";

// A second opinion on what a reply changed, asked of a connection that did not write the code and
// is given nothing but the diff: no conversation, no project folder, no tools. The idea is the
// isolated security gate in studioKjm/ai-harness-template — a reviewer with no reason to defend
// the change.

const MAX_DIFF_CHARS = 60_000;
const MAX_UNTRACKED_CHARS = 8_000;

export const REVIEW_SYSTEM = `You review a patch for security problems only. You did not write it and know nothing else about the project.

Answer in this shape, and nothing else:

VERDICT: clean
or
VERDICT: findings

Then, for findings only, one block per problem:

- SEVERITY: critical | high | medium | low
  WHERE: file:line
  PROBLEM: one sentence
  FIX: one sentence

Look for: secrets and credentials, injection (shell, SQL, path), missing authorisation checks,
unsafe deserialisation, weak randomness for security use, permissive CORS or cookies, and data
sent somewhere new. Ignore style, naming, tests and performance. Report only what the patch
itself shows; do not guess at code you cannot see. Say "VERDICT: clean" when you find nothing.`;

// The diff of everything not yet committed, including new files, capped so one reply can hold it.
export async function collectDiff(git: GitRunner, projectPath: string): Promise<string> {
  const tracked = await git(["diff", "--no-ext-diff", "--no-color", "HEAD"], {
    cwd: projectPath,
  }).catch(() => "");
  const untracked = await git(["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: projectPath,
  }).catch(() => "");

  const parts = tracked.trim() === "" ? [] : [tracked];
  let budget = MAX_UNTRACKED_CHARS;
  for (const path of untracked.split("\0").filter(Boolean)) {
    if (budget <= 0) break;
    const content = await readFile(join(projectPath, path), "utf8").catch(() => "");
    if (content === "" || content.includes("\0")) continue;
    const body = content.slice(0, budget);
    budget -= body.length;
    parts.push(`--- /dev/null\n+++ b/${path}\n${body.replace(/^/gm, "+")}`);
  }

  const diff = parts.join("\n");
  return diff.length > MAX_DIFF_CHARS
    ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… the patch was longer and was cut here.`
    : diff;
}

export function reviewPrompt(diff: string): string {
  return `Review this patch:\n\n${diff}`;
}

// The verdict line the reviewer was asked for; anything else is "unclear", and the text is shown
// as it came so a confused answer is never read as approval.
export function reviewVerdict(text: string): "clean" | "findings" | "unclear" {
  const line = text
    .split("\n")
    .map((value) => value.trim())
    .find((value) => /^verdict:/i.test(value));
  if (!line) return "unclear";
  if (/clean/i.test(line)) return "clean";
  return /finding/i.test(line) ? "findings" : "unclear";
}
