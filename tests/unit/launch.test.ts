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

// Node's own npx.cmd and npm.cmd, installed beside node.exe (npm 10 and 11 write the same text).
const nodeShim = (tool: "npm" | "npx") => {
  const name = tool.toUpperCase();
  return [
    ":: Created by npm, please don't edit manually.",
    "@ECHO OFF",
    "",
    "SETLOCAL",
    "",
    'SET "NODE_EXE=%~dp0\\node.exe"',
    'IF NOT EXIST "%NODE_EXE%" (',
    '  SET "NODE_EXE=node"',
    ")",
    "",
    'SET "NPM_PREFIX_JS=%~dp0\\node_modules\\npm\\bin\\npm-prefix.js"',
    `SET "${name}_CLI_JS=%~dp0\\node_modules\\npm\\bin\\${tool}-cli.js"`,
    `FOR /F "delims=" %%F IN ('CALL "%NODE_EXE%" "%NPM_PREFIX_JS%"') DO (`,
    `  SET "NPM_PREFIX_${name}_CLI_JS=%%F\\node_modules\\npm\\bin\\${tool}-cli.js"`,
    ")",
    `IF EXIST "%NPM_PREFIX_${name}_CLI_JS%" (`,
    `  SET "${name}_CLI_JS=%NPM_PREFIX_${name}_CLI_JS%"`,
    ")",
    "",
    `"%NODE_EXE%" "%${name}_CLI_JS%" %*`,
    "",
  ].join("\r\n");
};

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

  it("runs a node script without a .js extension only when the shim runs node", () => {
    const tsc = NPM_SHIM.replace(
      "node_modules\\@google\\gemini-cli\\dist\\index.js",
      "..\\typescript\\bin\\tsc",
    );
    expect(npmShimScript(tsc)).toBe("../typescript/bin/tsc");
    expect(npmShimScript(tsc.replace('SET "_prog=node"', 'SET "_prog=sh"'))).toBeUndefined();
  });

  it("finds the script Node's own npx.cmd and npm.cmd run, and nothing else in that form", () => {
    expect(npmShimScript(nodeShim("npx"))).toBe("node_modules/npm/bin/npx-cli.js");
    expect(npmShimScript(nodeShim("npm"))).toBe("node_modules/npm/bin/npm-cli.js");
    // The variable must point at npm's own script beside the shim.
    expect(
      npmShimScript(nodeShim("npx").replace('npm\\bin\\npx-cli.js"\r', 'evil.js"\r')),
    ).toBeUndefined();
    expect(
      npmShimScript(nodeShim("npx").replace('"%NODE_EXE%" "%NPX', '"%NODE_EXE%" -e x "%NPX')),
    ).toBeUndefined();
  });

  it("finds a bare command on PATH as a .exe or .cmd, and runs npx through node", () => {
    dir = mkdtempSync(join(tmpdir(), "zenith-shim-"));
    writeFileSync(join(dir, "npx"), "#!/bin/sh"); // npm's sh script for Git Bash, never run.
    writeFileSync(join(dir, "npx.cmd"), nodeShim("npx"));
    writeFileSync(join(dir, "node.exe"), "");
    writeFileSync(join(dir, "uvx.exe"), "");
    const env = { PATH: dir };
    expect(launchPlan("npx", env, "win32")).toEqual({
      command: join(dir, "node.exe"),
      args: [resolve(dir, "node_modules/npm/bin/npx-cli.js")],
    });
    expect(launchPlan("npx.cmd", env, "win32").args).toEqual([
      resolve(dir, "node_modules/npm/bin/npx-cli.js"),
    ]);
    expect(launchPlan("uvx", env, "win32")).toEqual({ command: join(dir, "uvx.exe"), args: [] });
    // Not found: left for spawn to report.
    expect(launchPlan("zenith-none", env, "win32")).toEqual({ command: "zenith-none", args: [] });
    expect(launchPlan("npx", env, "darwin")).toEqual({ command: "npx", args: [] });
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
