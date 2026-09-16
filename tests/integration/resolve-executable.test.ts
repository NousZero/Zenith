import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { childProcessPath, resolveExecutable } from "../../src/main/cli/resolve-executable";

describe.skipIf(process.platform === "win32")("resolveExecutable", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "zenith-resolve-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeFile(path: string, mode: number) {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "#!/bin/sh\necho hi\n");
    await chmod(path, mode);
  }

  it("finds an executable on PATH", async () => {
    const bin = join(root, "bin");
    await makeFile(join(bin, "claude"), 0o755);
    const found = await resolveExecutable("claude", {
      env: { PATH: bin },
      home: join(root, "home"),
      platform: process.platform,
    });
    expect(found).toBe(join(bin, "claude"));
  });

  it("finds per-user installs that a desktop-launched app's PATH would miss", async () => {
    const home = join(root, "home");
    await makeFile(join(home, ".local", "bin", "claude"), 0o755);
    const found = await resolveExecutable("claude", {
      env: { PATH: "/nonexistent" },
      home,
      platform: process.platform,
    });
    expect(found).toBe(join(home, ".local", "bin", "claude"));
  });

  it("skips files that are not executable and names that do not exist", async () => {
    const bin = join(root, "bin");
    await makeFile(join(bin, "zenith-probe-not-executable"), 0o644);
    const environment = {
      env: { PATH: bin },
      home: join(root, "home"),
      platform: process.platform,
    };
    expect(await resolveExecutable("zenith-probe-not-executable", environment)).toBeUndefined();
    expect(await resolveExecutable("zenith-probe-missing", environment)).toBeUndefined();
  });

  it("puts the executable's own directory first on the child PATH", () => {
    const path = childProcessPath("/opt/tools/bin/gemini", {
      env: { PATH: "/usr/bin" },
      home: "/home/user",
      platform: "darwin",
    });
    const parts = path.split(delimiter);
    expect(parts[0]).toBe("/opt/tools/bin");
    expect(parts).toContain("/usr/bin");
    expect(parts).toContain("/home/user/.local/bin");
  });
});
