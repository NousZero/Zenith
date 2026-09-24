import { writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// On Windows a Node script can't be spawned directly, and real agents arrive as npm .cmd shims.
// This writes an npm-style shim beside a fixture script and returns its path, so tests launch
// fixtures the way Zenith launches real CLIs there. Elsewhere the script path is returned as is.
export function launchable(scriptPath: string): string {
  if (process.platform !== "win32") return scriptPath;
  const shim = join(dirname(scriptPath), `${basename(scriptPath).replace(/\.[^.]+$/, "")}.cmd`);
  writeFileSync(
    shim,
    `@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${basename(scriptPath)}" %*\r\n`,
  );
  return shim;
}
