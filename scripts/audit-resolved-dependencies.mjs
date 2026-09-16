import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(process.cwd());
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const packageEntries = Object.entries(lock.packages ?? {});
const rootLockEntry = lock.packages?.[""] ?? {};
const registryPrefix = "https://registry.npmjs.org/";
const lifecycleNames = ["preinstall", "install", "postinstall", "prepare"];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const nonRegistry = [];
const missingIntegrity = [];
const deprecated = [];
const lockInstallFlags = [];
const registries = new Set();

for (const [lockPath, entry] of packageEntries) {
  if (typeof entry.resolved === "string") {
    try {
      registries.add(new URL(entry.resolved).host);
    } catch {
      registries.add("non-url");
    }
    if (!entry.resolved.startsWith(registryPrefix)) {
      nonRegistry.push({ lockPath, resolved: entry.resolved });
    }
    if (typeof entry.integrity !== "string" || entry.integrity.length === 0) {
      missingIntegrity.push({ lockPath, resolved: entry.resolved });
    }
  }
  if (typeof entry.deprecated === "string") {
    deprecated.push({ lockPath, version: entry.version, message: entry.deprecated });
  }
  if (entry.hasInstallScript === true) {
    lockInstallFlags.push({ lockPath, version: entry.version });
  }
}

const directVersionMismatches = [];
for (const section of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(manifest[section] ?? {})) {
    const lockedVersion = rootLockEntry[section]?.[name];
    const installedPath = join(root, "node_modules", ...name.split("/"), "package.json");
    const installedVersion = existsSync(installedPath)
      ? JSON.parse(readFileSync(installedPath, "utf8")).version
      : null;
    if (lockedVersion !== version || installedVersion !== version) {
      directVersionMismatches.push({ name, declared: version, lockedVersion, installedVersion });
    }
  }
}

const lifecyclePackages = [];
for (const [lockPath, entry] of packageEntries) {
  if (!lockPath.startsWith("node_modules/")) continue;
  const packageJsonPath = join(root, ...lockPath.split("/"), "package.json");
  if (!existsSync(packageJsonPath)) continue;

  const packageJsonText = readFileSync(packageJsonPath, "utf8");
  const installed = JSON.parse(packageJsonText);
  const lifecycleScripts = {};
  for (const name of lifecycleNames) {
    const command = installed.scripts?.[name];
    if (typeof command === "string" && command.trim() !== "") {
      lifecycleScripts[name] = { command, sha256: sha256(command) };
    }
  }
  if (Object.keys(lifecycleScripts).length > 0 || entry.hasInstallScript === true) {
    lifecyclePackages.push({
      name: installed.name,
      version: installed.version,
      lockPath,
      integrity: entry.integrity ?? null,
      packageJsonSha256: sha256(packageJsonText),
      lockHasInstallScript: entry.hasInstallScript === true,
      lifecycleScripts,
    });
  }
}

const result = {
  status:
    nonRegistry.length === 0 &&
    missingIntegrity.length === 0 &&
    directVersionMismatches.length === 0
      ? "passed"
      : "failed",
  lockfileVersion: lock.lockfileVersion,
  packageEntries: packageEntries.length,
  directDependencies:
    Object.keys(manifest.dependencies ?? {}).length +
    Object.keys(manifest.devDependencies ?? {}).length,
  registries: [...registries].sort(),
  nonRegistry,
  missingIntegrity,
  directVersionMismatches,
  lockInstallFlags,
  deprecated,
  lifecyclePackages,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.status !== "passed") process.exitCode = 1;
