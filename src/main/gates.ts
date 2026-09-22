import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

import type { GateResult, GitStatus } from "../shared/types";

// Checks run over what a reply changed, so a finished turn says whether the project is still in
// good shape: leaked secrets, errors the language server reports, and how far the change spread.
// They read files and ask the language server; nothing here changes anything.

// Only files a person would edit are read, and only their first part.
const MAX_FILES = 60;
const MAX_BYTES = 256 * 1024;
const MAX_TYPE_CHECKED = 10;
// Above this many changed files a reply has spread beyond one task, in the spirit of the
// "surgical changes" gate in studioKjm/ai-harness-template.
const MAX_CHANGED_FILES = 15;
const MAX_FINDINGS = 8;

const SKIPPED_DIRECTORIES = /(^|\/)(node_modules|\.git|dist|build|out|\.vite|coverage)(\/|$)/;
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".node",
  ".wasm",
  ".db",
  ".sqlite",
]);

// Named patterns, so a finding says what kind of secret it looks like.
const SECRETS: readonly { label: string; pattern: RegExp }[] = [
  { label: "an Anthropic or OpenAI key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { label: "a GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: "an AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "a Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { label: "a Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { label: "a private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    label: "a key written into the code",
    pattern: /\b(?:api[_-]?key|secret|password|token)\b\s*[:=]\s*["'][A-Za-z0-9/+=_-]{20,}["']/i,
  },
];

// Placeholders people write on purpose; flagging them trains the reader to ignore the gate.
const PLACEHOLDER = /(example|placeholder|your[_-]?(key|token)|xxxx|\.\.\.|<[a-z-]+>)/i;

function readable(path: string): boolean {
  return !SKIPPED_DIRECTORIES.test(path) && !BINARY_EXTENSIONS.has(extname(path).toLowerCase());
}

async function readText(absolute: string): Promise<string | undefined> {
  const size = await stat(absolute).then(
    (info) => info.size,
    () => undefined,
  );
  if (size === undefined || size > MAX_BYTES) return undefined;
  const text = await readFile(absolute, "utf8").catch(() => undefined);
  // A NUL byte means the file isn't text, whatever its name says.
  return text === undefined || text.includes("\0") ? undefined : text;
}

function secretsIn(path: string, text: string): string[] {
  const findings: string[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.length > 500 || PLACEHOLDER.test(line)) return;
    const hit = SECRETS.find((secret) => secret.pattern.test(line));
    if (hit) findings.push(`${path}:${index + 1}: looks like ${hit.label}`);
  });
  return findings;
}

function result(
  id: GateResult["id"],
  label: string,
  state: GateResult["state"],
  detail: string,
  findings: string[] = [],
): GateResult {
  const shown = findings.slice(0, MAX_FINDINGS);
  if (findings.length > shown.length) shown.push(`… ${findings.length - shown.length} more`);
  return { id, label, state, detail, findings: shown };
}

export interface GateDeps {
  gitStatus(projectPath: string): Promise<GitStatus>;
  // The project's language server, as used after an approved edit.
  problems(root: string, filePath: string, text: string): Promise<string>;
  // Whether a language server covers this file at all.
  served(filePath: string): boolean;
}

export async function runGates(deps: GateDeps, projectPath: string): Promise<GateResult[]> {
  const status = await deps.gitStatus(projectPath).catch(() => undefined);
  if (!status?.isRepository) {
    return [
      result("scope", "Scope", "skipped", "Not a Git repository, so changes can't be listed."),
    ];
  }

  const changed = status.files.filter((file) => file.state !== "deleted").map((file) => file.path);
  if (changed.length === 0) {
    return [result("scope", "No changes", "pass", "Nothing changed in the project folder.")];
  }

  const files = changed.filter(readable).slice(0, MAX_FILES);
  const texts = new Map<string, string>();
  for (const path of files) {
    const text = await readText(join(projectPath, path));
    if (text !== undefined) texts.set(path, text);
  }

  const leaks = [...texts].flatMap(([path, text]) => secretsIn(path, text));
  const secrets = result(
    "secrets",
    "Secrets",
    leaks.length === 0 ? "pass" : "fail",
    leaks.length === 0
      ? `No keys or tokens in ${texts.size} changed ${texts.size === 1 ? "file" : "files"}.`
      : `${leaks.length} ${leaks.length === 1 ? "line looks" : "lines look"} like a secret.`,
    leaks,
  );

  const problems: string[] = [];
  let checked = 0;
  for (const [path, text] of texts) {
    if (checked >= MAX_TYPE_CHECKED) break;
    if (!deps.served(path)) continue;
    const report = await deps
      .problems(projectPath, join(projectPath, path), text)
      .catch(() => "")
      .then((value) => value.trim());
    if (report !== "") problems.push(report);
    checked += 1;
  }
  const errors = result(
    "problems",
    "Errors",
    problems.length === 0 ? "pass" : "fail",
    checked === 0
      ? "No language server covers the changed files."
      : problems.length === 0
        ? `No errors in ${checked} checked ${checked === 1 ? "file" : "files"}.`
        : `${problems.length} ${problems.length === 1 ? "file has" : "files have"} errors.`,
    problems,
  );
  // With no language server the check says nothing either way.
  const problemsGate = checked === 0 ? { ...errors, state: "skipped" as const } : errors;

  const scope = result(
    "scope",
    "Scope",
    changed.length > MAX_CHANGED_FILES ? "fail" : "pass",
    `${changed.length} changed ${changed.length === 1 ? "file" : "files"}${
      changed.length > MAX_CHANGED_FILES ? `, more than ${MAX_CHANGED_FILES}` : ""
    }.`,
    changed.length > MAX_CHANGED_FILES ? changed : [],
  );

  return [secrets, problemsGate, scope];
}
