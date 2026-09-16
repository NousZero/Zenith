import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import process from "node:process";

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const requiredScripts = [
  "dev",
  "format:check",
  "lint",
  "typecheck",
  "test:unit",
  "test:integration",
  "test:component",
  "test",
  "verify",
  "package",
  "make",
];

const forbiddenRootLifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];

const lockfileNames = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
]);

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "out",
  "dist",
  "release",
  "coverage",
  "playwright-report",
  "test-results",
]);

const exactStableSemver = /^\d+\.\d+\.\d+$/u;
const exactSemver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/u;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateManifest(manifest) {
  const errors = [];

  if (manifest.private !== true) errors.push("package must remain private");
  if (manifest.packageManager !== "npm@11.17.0") {
    errors.push("packageManager must be exactly npm@11.17.0");
  }
  if (manifest.engines?.node !== "24.17.0") {
    errors.push("engines.node must be exactly 24.17.0 for M0");
  }
  if (manifest.engines?.npm !== "11.17.0") {
    errors.push("engines.npm must be exactly 11.17.0 for M0");
  }
  if ("workspaces" in manifest) errors.push("workspaces are not allowed in M0");

  const overrides = manifest.overrides ?? {};
  if (typeof overrides !== "object" || Array.isArray(overrides)) {
    errors.push("overrides must be a flat object");
  } else {
    for (const [name, specification] of Object.entries(overrides)) {
      if (typeof specification !== "string" || !exactSemver.test(specification)) {
        errors.push(
          `overrides.${name} must be one exact semver; received ${JSON.stringify(specification)}`,
        );
      }
    }
  }

  for (const section of dependencySections) {
    const entries = manifest[section] ?? {};
    if (typeof entries !== "object" || Array.isArray(entries)) {
      errors.push(`${section} must be an object`);
      continue;
    }

    for (const [name, specification] of Object.entries(entries)) {
      if (typeof specification !== "string" || !exactStableSemver.test(specification)) {
        errors.push(
          `${section}.${name} must be one exact stable semver; received ${JSON.stringify(specification)}`,
        );
      }
    }
  }

  const scripts = manifest.scripts ?? {};
  for (const name of requiredScripts) {
    if (typeof scripts[name] !== "string" || scripts[name].trim() === "") {
      errors.push(`required script is missing: ${name}`);
    }
  }
  for (const name of forbiddenRootLifecycleScripts) {
    if (name in scripts) errors.push(`root lifecycle script is forbidden in M0: ${name}`);
  }

  return errors;
}

function parseNpmrc(path) {
  const values = new Map();
  const lines = readFileSync(path, "utf8").split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return values;
}

function findFiles(root, targetName, excludedDirectoryRoots = new Set(), results = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && !excludedDirectoryRoots.has(resolve(path))) {
        findFiles(path, targetName, excludedDirectoryRoots, results);
      }
    } else if (entry.isFile() && entry.name === targetName) {
      results.push(path);
    }
  }
  return results;
}

function validateRoot(root) {
  const errors = [];
  const npmrcPath = join(root, ".npmrc");
  if (!existsSync(npmrcPath)) {
    errors.push(".npmrc is missing");
  } else {
    const npmrc = parseNpmrc(npmrcPath);
    const expected = new Map([
      ["registry", "https://registry.npmjs.org/"],
      ["strict-ssl", "true"],
      ["engine-strict", "true"],
      ["save-exact", "true"],
      ["package-lock", "true"],
      ["ignore-scripts", "true"],
    ]);
    for (const [key, value] of expected) {
      if (npmrc.get(key) !== value) errors.push(`.npmrc requires ${key}=${value}`);
    }
  }

  const rootLockfiles = readdirSync(root).filter((name) => lockfileNames.has(name));
  const competing = rootLockfiles.filter((name) => name !== "package-lock.json");
  if (competing.length > 0) {
    errors.push(`competing lockfiles are not allowed: ${competing.join(", ")}`);
  }

  const inertSnapshotPayloadRoots = new Set([
    resolve(root, "resources", "supplied", "agent-skills", "0.6.6", "files"),
  ]);
  const packageFiles = findFiles(root, "package.json", inertSnapshotPayloadRoots);
  const nestedPackageFiles = packageFiles.filter(
    (path) => resolve(path) !== resolve(root, "package.json"),
  );
  if (nestedPackageFiles.length > 0) {
    errors.push(
      `nested package roots are not allowed in M0: ${nestedPackageFiles
        .map((path) => relative(root, path))
        .join(", ")}`,
    );
  }

  return errors;
}

function runSelfTest(baseManifest) {
  const unsafeSpecifications = [
    "^1.2.3",
    "~1.2.3",
    "*",
    "latest",
    "npm:other@1.2.3",
    "git+https://example.invalid/repo.git",
    "file:../package",
    "https://example.invalid/package.tgz",
    "workspace:*",
  ];

  for (const specification of unsafeSpecifications) {
    const seeded = structuredClone(baseManifest);
    seeded.devDependencies = { ...seeded.devDependencies, "unsafe-fixture": specification };
    const errors = validateManifest(seeded);
    if (!errors.some((error) => error.includes("unsafe-fixture"))) {
      throw new Error(`self-test failed to reject ${specification}`);
    }
  }

  for (const specification of unsafeSpecifications) {
    const seeded = structuredClone(baseManifest);
    seeded.overrides = { ...seeded.overrides, "unsafe-override": specification };
    const errors = validateManifest(seeded);
    if (!errors.some((error) => error.includes("unsafe-override"))) {
      throw new Error(`self-test failed to reject override ${specification}`);
    }
  }

  process.stdout.write(
    `${JSON.stringify({ status: "passed", rejectedUnsafeSpecifications: unsafeSpecifications.length * 2 })}\n`,
  );
}

const root = resolve(process.cwd());
const manifestFlagIndex = process.argv.indexOf("--manifest");
const manifestPath =
  manifestFlagIndex >= 0
    ? resolve(process.argv[manifestFlagIndex + 1] ?? "")
    : join(root, "package.json");

if (!existsSync(manifestPath) || basename(manifestPath) !== "package.json") {
  process.stderr.write(`dependency policy: package.json not found at ${manifestPath}\n`);
  process.exit(1);
}

const manifest = readJson(manifestPath);
const errors = [
  ...validateManifest(manifest),
  ...(manifestPath === join(root, "package.json") ? validateRoot(root) : []),
];

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`dependency policy: ${error}\n`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  runSelfTest(manifest);
} else {
  const directDependencyCount = dependencySections.reduce(
    (count, section) => count + Object.keys(manifest[section] ?? {}).length,
    0,
  );
  process.stdout.write(
    `${JSON.stringify({ status: "passed", directDependencyCount, lifecycleScripts: "disabled" })}\n`,
  );
}
