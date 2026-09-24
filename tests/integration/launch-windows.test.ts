import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { spawnResolved } from "../../src/main/cli/launch";

// Windows only: a fake npm-installed CLI must start from its .cmd shim, and arguments cmd.exe
// would treat specially must arrive unchanged, which proves no shell is involved.
describe.skipIf(process.platform !== "win32")("npm .cmd shims on Windows", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("runs the shim's script with node and passes arguments through untouched", async () => {
    dir = mkdtempSync(join(tmpdir(), "zenith-shim-"));
    const script = join(dir, "node_modules", "fake-cli", "index.js");
    mkdirSync(dirname(script), { recursive: true });
    writeFileSync(script, "process.stdout.write(JSON.stringify(process.argv.slice(2)));");
    const shim = join(dir, "fake-cli.cmd");
    writeFileSync(
      shim,
      '@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\fake-cli\\index.js" %*\r\n',
    );

    const args = ["plain", "a&b", 'say "hi"', "%PATH%"];
    const child = spawnResolved(shim, args, { env: process.env });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (out += chunk));
    await new Promise((resolve) => child.on("close", resolve));
    expect(JSON.parse(out)).toEqual(args);
  });
});
