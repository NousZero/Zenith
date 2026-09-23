import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
  chmod,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeFileAtomic } from "../../src/main/atomic-write";

describe("writeFileAtomic", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-atomic-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates and replaces files without leaving temporary files", async () => {
    const file = join(dir, "a.txt");
    await writeFileAtomic(file, "one");
    await writeFileAtomic(file, "two");
    expect(await readFile(file, "utf8")).toBe("two");
    expect(await readdir(dir)).toEqual(["a.txt"]);
  });

  it.skipIf(process.platform === "win32")("keeps an existing file's mode", async () => {
    const file = join(dir, "run.sh");
    await writeFile(file, "#!/bin/sh\n");
    await chmod(file, 0o755);
    await writeFileAtomic(file, "#!/bin/sh\necho hi\n");
    expect((await stat(file)).mode & 0o777).toBe(0o755);
  });

  it.skipIf(process.platform === "win32")("writes through a symbolic link", async () => {
    const real = join(dir, "real.txt");
    const link = join(dir, "link.txt");
    await writeFile(real, "old");
    await symlink(real, link);
    await writeFileAtomic(link, "new");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(real, "utf8")).toBe("new");
  });

  it("cleans up and throws when the folder does not exist", async () => {
    await expect(writeFileAtomic(join(dir, "missing", "a.txt"), "x")).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
});
