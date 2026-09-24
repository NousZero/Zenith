import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  initErrorLog,
  logError,
  logPath,
  logRendererError,
  logWarn,
  readRecentLog,
} from "../../src/main/error-log";

describe("error log", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-errorlog-"));
    initErrorLog(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appends one line per entry with timestamp, level, and source", async () => {
    logError("main", new Error("boom"));
    logWarn("ipc:foo:bar", "careful");
    const contents = await readFile(logPath(), "utf8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.*\[error\] \[main\] Error: boom/);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T.*\[warn\] \[ipc:foo:bar\] careful/);
  });

  it("redacts secrets before writing", async () => {
    logError("main", new Error("leaked OPENAI_API_KEY=sk-abcdefghijklmnop token"));
    const contents = await readFile(logPath(), "utf8");
    expect(contents).not.toContain("sk-abcdefghijklmnop");
    expect(contents).toContain("OPENAI_API_KEY=[redacted]");
  });

  it("rotates into zenith.log.1 once the file passes ~1 MB", async () => {
    const big = "x".repeat(1024 * 1024 + 1);
    logError("main", big);
    logError("main", "after rotation");
    const rotated = await readFile(`${logPath()}.1`, "utf8");
    const current = await readFile(logPath(), "utf8");
    expect(rotated).toContain(big);
    expect(current).toContain("after rotation");
    expect(current).not.toContain(big);
  });

  it("never throws when the log directory can't be created", async () => {
    const blocker = join(dir, "blocked-file");
    await writeFile(blocker, "not a directory");
    // A plain file sits where the log directory needs to go, so mkdir underneath it fails;
    // logging must still return normally instead of throwing into the caller.
    initErrorLog(join(blocker, "logs"));
    expect(() => logError("main", new Error("x"))).not.toThrow();
  });

  it("never throws when the log path is a directory it can't write through", async () => {
    // Make the log's own path a directory, so appendFileSync on it fails.
    await mkdir(logPath(), { recursive: true });
    expect(() => logError("main", new Error("x"))).not.toThrow();
  });

  it("readRecentLog bounds the returned size and returns the tail", async () => {
    for (let i = 0; i < 500; i++) logError("main", `line ${i}`);
    const all = readRecentLog(1_000_000);
    const bounded = readRecentLog(200);
    expect(bounded.length).toBeLessThanOrEqual(200);
    expect(all.endsWith(bounded)).toBe(true);
    expect(bounded).toContain("line 499");
  });

  it("readRecentLog returns an empty string when there is nothing to read", async () => {
    initErrorLog(join(dir, "never-written"));
    expect(readRecentLog()).toBe("");
  });

  it("logRendererError validates and caps an untrusted payload", async () => {
    logRendererError({ message: "x".repeat(3_000), stack: "y".repeat(9_000) });
    logRendererError("not an object");
    logRendererError({ stack: "no message field" });
    const contents = await readFile(logPath(), "utf8");
    const lines = contents.trim().split("\n").filter(Boolean);
    // Only the one valid report was written.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[renderer]");
    expect(contents.length).toBeLessThan(12_000);
  });

  it.skipIf(process.platform === "win32")(
    "swallows a write failure from a read-only log file",
    async () => {
      await mkdir(join(dir, "logs"), { recursive: true });
      await writeFile(logPath(), "existing\n");
      await chmod(logPath(), 0o444);
      expect(() => logError("main", new Error("x"))).not.toThrow();
    },
  );
});
