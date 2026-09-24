import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { launchPlan, npmShimScript } from "../../src/main/cli/launch";

// What npm's cmd-shim writes for a globally installed CLI.
const NPM_SHIM = [
  "@ECHO off",
  "GOTO start",
  ":find_dp0",
  "SET dp0=%~dp0",
  "EXIT /b",
  ":start",
  "SETLOCAL",
  "CALL :find_dp0",
  "",
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ") ELSE (",
  '  SET "_prog=node"',
  "  SET PATHEXT=%PATHEXT:;.JS;=;%",
  ")",
  "",
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@google\\gemini-cli\\dist\\index.js" %*',
].join("\r\n");

describe("launching npm .cmd shims without a shell", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("finds the script an npm shim runs", () => {
    expect(npmShimScript(NPM_SHIM)).toBe("node_modules/@google/gemini-cli/dist/index.js");
    expect(npmShimScript("@echo off\r\ncall something-else.exe %*")).toBeUndefined();
  });

  it("runs other commands as they are, and on other systems leaves .cmd alone", () => {
    expect(launchPlan("/usr/local/bin/gemini", {}, "darwin")).toEqual({
      command: "/usr/local/bin/gemini",
      args: [],
    });
    expect(launchPlan("C:\\tools\\claude.exe", {}, "win32")).toEqual({
      command: "C:\\tools\\claude.exe",
      args: [],
    });
  });

  it("runs a shim's script with the node.exe beside it, and refuses a batch file it can't read", () => {
    dir = mkdtempSync(join(tmpdir(), "zenith-shim-"));
    const shim = join(dir, "gemini.cmd");
    writeFileSync(shim, NPM_SHIM);
    writeFileSync(join(dir, "node.exe"), "");
    expect(launchPlan(shim, { PATH: "" }, "win32")).toEqual({
      command: join(dir, "node.exe"),
      args: [resolve(dir, "node_modules/@google/gemini-cli/dist/index.js")],
    });

    const other = join(dir, "other.cmd");
    writeFileSync(other, "@echo off\r\ndel *.* %*");
    expect(() => launchPlan(other, { PATH: "" }, "win32")).toThrow("without a shell");
  });
});
