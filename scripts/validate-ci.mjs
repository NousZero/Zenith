import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// Keeps the CI workflow to its reviewed shape: pinned actions, read-only permissions, no secrets
// or publishing, a fixed list of commands, and failure uploads limited to test output. Run by
// `npm run verify`, so an edit to the workflow is checked before it lands.
const root = path.resolve(import.meta.dirname, "..");
const workflowPath = path.join(root, ".github", "workflows", "ci.yml");
const packagePath = path.join(root, "package.json");
const [workflowSource, packageSource] = await Promise.all([
  readFile(workflowPath, "utf8"),
  readFile(packagePath, "utf8"),
]);

// JSON is a strict subset of YAML 1.2, so this gives the workflow a complete,
// dependency-free local syntax check rather than a partial indentation parser.
const workflow = JSON.parse(workflowSource);
const packageManifest = JSON.parse(packageSource);
const serialized = JSON.stringify(workflow);
const expectedActions = new Set([
  "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
  "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
]);
const expectedRuns = new Set([
  // Node 24.17.0 ships npm 11.13.0; the manifest pins npm 11.17.0 exactly.
  "npm install --global npm@11.17.0 --no-audit --no-fund",
  "npm ci --ignore-scripts --no-audit --no-fund",
  "npm run verify",
  // Lifecycle scripts stay off; the end-to-end job fetches only Electron's own binary.
  "node node_modules/electron/install.js",
  "npm run test:e2e:build",
]);
const expectedRunners = new Set([
  "ubuntu-latest",
  "macos-latest",
  "windows-latest",
  "${{ matrix.os }}",
]);

const push = workflow.on.push;
if (push !== undefined && JSON.stringify(push) !== JSON.stringify({ branches: ["main"] })) {
  throw new Error("A push trigger may only run on main.");
}
if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: "read" })) {
  throw new Error("Workflow permissions must be exactly contents: read.");
}
if (/\b(?:deploy|publish|release|telemetry|secret|secrets)\b/iu.test(serialized)) {
  throw new Error("Workflow contains a forbidden publishing, telemetry, or secret reference.");
}
if (Object.hasOwn(workflow, "env")) {
  throw new Error("Workflow-level environment values are not permitted.");
}

const jobs = Object.entries(workflow.jobs ?? {});
if (jobs.length === 0) throw new Error("The workflow has no jobs.");
for (const [id, job] of jobs) {
  if (!expectedRunners.has(job["runs-on"])) {
    throw new Error(`Job ${id} uses an unreviewed runner: ${job["runs-on"]}`);
  }
  for (const os of job.strategy?.matrix?.os ?? []) {
    if (!expectedRunners.has(os)) throw new Error(`Job ${id} lists an unreviewed runner: ${os}`);
  }
  if (Object.hasOwn(job, "env") || Object.hasOwn(job, "permissions")) {
    throw new Error(`Job ${id} must not set environment values or its own permissions.`);
  }
  for (const step of job.steps ?? []) {
    if (Object.hasOwn(step, "env")) {
      throw new Error(`Step ${JSON.stringify(step.name)} must not receive environment values.`);
    }
    if (
      step.uses &&
      (!/^[^@]+@[0-9a-f]{40}$/u.test(step.uses) || !expectedActions.has(step.uses))
    ) {
      throw new Error(`Action is not pinned to its reviewed commit: ${step.uses}`);
    }
    if (step.run) {
      if (!expectedRuns.has(step.run)) throw new Error(`Unreviewed workflow command: ${step.run}`);
      const scriptName = step.run.match(/^npm run ([a-z:0-9]+)$/u)?.[1];
      if (scriptName && !Object.hasOwn(packageManifest.scripts, scriptName)) {
        throw new Error(`Workflow references missing package script: ${scriptName}`);
      }
    }
    if (step.uses?.startsWith("actions/upload-artifact@")) {
      const paths = String(step.with?.path ?? "")
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .sort();
      if (step.if !== "failure()") {
        throw new Error("Failure artifacts may only upload after a failed job.");
      }
      if (JSON.stringify(paths) !== JSON.stringify(["playwright-report/", "test-results/"])) {
        throw new Error("Failure artifact paths exceed the reviewed test-output allowlist.");
      }
      if (
        step.with["if-no-files-found"] !== "ignore" ||
        step.with["include-hidden-files"] !== false ||
        step.with["retention-days"] !== 3
      ) {
        throw new Error("Failure artifact retention or hidden-file policy changed.");
      }
    }
  }
}

process.stdout.write(
  `${JSON.stringify({ status: "passed", jobs: jobs.map(([id]) => id), commands: [...expectedRuns] })}\n`,
);
