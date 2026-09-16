import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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
const expectedRuns = new Set(["npm ci --ignore-scripts --no-audit --no-fund", "npm run verify"]);

if (Object.hasOwn(workflow.on, "push")) {
  throw new Error("The M0 workflow must not have a push trigger.");
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

const steps = workflow.jobs?.verify?.steps;
if (!Array.isArray(steps) || steps.length !== 5) {
  throw new Error("Expected exactly five reviewed Windows verification steps.");
}
if (workflow.jobs.verify["runs-on"] !== "windows-latest") {
  throw new Error("The M0 workflow must target a hosted Windows runner.");
}

for (const step of steps) {
  if (Object.hasOwn(step, "env")) {
    throw new Error(`Step ${JSON.stringify(step.name)} must not receive environment values.`);
  }
  if (step.uses) {
    if (!/^[^@]+@[0-9a-f]{40}$/u.test(step.uses) || !expectedActions.has(step.uses)) {
      throw new Error(`Action is not pinned to its reviewed commit: ${step.uses}`);
    }
  }
  if (step.run) {
    if (!expectedRuns.has(step.run)) {
      throw new Error(`Unreviewed workflow command: ${step.run}`);
    }
    const scriptName = step.run.match(/^npm run ([a-z:]+)$/u)?.[1];
    if (scriptName && !Object.hasOwn(packageManifest.scripts, scriptName)) {
      throw new Error(`Workflow references missing package script: ${scriptName}`);
    }
  }
}

const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
const uploadPaths = upload?.with?.path
  ?.split("\n")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .sort();
if (upload?.if !== "failure()") {
  throw new Error("Failure artifacts may only upload after a failed job.");
}
if (JSON.stringify(uploadPaths) !== JSON.stringify(["playwright-report/", "test-results/"])) {
  throw new Error("Failure artifact paths exceed the reviewed test-output allowlist.");
}
if (
  upload.with["if-no-files-found"] !== "ignore" ||
  upload.with["include-hidden-files"] !== false ||
  upload.with["retention-days"] !== 3
) {
  throw new Error("Failure artifact retention or hidden-file policy changed.");
}

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    syntax: "JSON subset of YAML 1.2",
    commands: [...expectedRuns],
    pinnedActions: expectedActions.size,
    uploadedPaths: uploadPaths,
    hostedExecution: "not-run",
  })}\n`,
);
