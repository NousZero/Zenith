import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { default: nativeExtractZip } = await import("@electron-internal/extract-zip");
const legacyExtractZipPath = require.resolve("extract-zip");

// Electron Packager 18 still loads extract-zip 2, whose stream pipeline stalls
// under Node 24. Replace that one process-local module export with Electron's
// locked native extractor before Forge or Packager is loaded.
require(legacyExtractZipPath);
require.cache[legacyExtractZipPath].exports = nativeExtractZip;

const forgePackage = require("@electron-forge/core/dist/api/package.js").default;
const forgeMake = require("@electron-forge/core/dist/api/make.js").default;
const projectRoot = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2];

if (mode !== "package" && mode !== "make") {
  throw new Error('Expected build mode "package" or "make".');
}

// Forge 7 can leave only unresolved promises while Electron Packager runs on
// Node 24. A pending promise does not keep Node alive, so retain one harmless
// handle until Forge resolves or rejects and the promised outputs are checked.
const keepAlive = setInterval(() => undefined, 1_000);

try {
  const currentPlatform =
    process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
  const currentArch = process.arch === "arm64" ? "arm64" : "x64";

  if (mode === "package") {
    const results = await forgePackage({
      dir: projectRoot,
      interactive: true,
      platform: currentPlatform,
      arch: currentArch,
    });

    if (results.length !== 1) {
      throw new Error(`Expected one packaged target, received ${results.length}.`);
    }

    await access(results[0].packagedPath);
    process.stdout.write(`Verified packaged application: ${results[0].packagedPath}\n`);
  } else {
    const results = await forgeMake({
      dir: projectRoot,
      interactive: true,
      platform: currentPlatform,
      arch: currentArch,
      skipPackage: false,
    });
    const artifacts = results.flatMap((result) => result.artifacts);

    if (artifacts.length === 0) {
      throw new Error("Forge completed without returning a distributable.");
    }

    await Promise.all(artifacts.map((artifact) => access(artifact)));
    process.stdout.write(`Verified ${artifacts.length} distributable artifact(s).\n`);
  }
} finally {
  clearInterval(keepAlive);
}
