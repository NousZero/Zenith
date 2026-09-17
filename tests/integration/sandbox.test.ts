import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLAUDE_SANDBOX_SETTINGS, detectSandbox } from "../../src/main/agent/sandbox";
import { runBash, type BashSandbox } from "../../src/main/agent/tools";

const env = { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "" };

describe.skipIf(process.platform !== "darwin")("sandboxed commands (macOS Seatbelt)", () => {
  let dir: string;
  let project: string;
  let outside: string;
  let sandbox: BashSandbox;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-sandbox-"));
    // Quotes and parentheses in the folder name must not change the sandbox profile.
    project = join(dir, 'we"ird (project)');
    outside = join(dir, "outside");
    await mkdir(project);
    await mkdir(outside);
    sandbox = { kind: "seatbelt", tempRoot: join(dir, "sandbox-tmp") };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is detected on this system", async () => {
    expect(await detectSandbox(env)).toBe("seatbelt");
  });

  it("allows writes in the project and its temp folder, and blocks them elsewhere", async () => {
    const result = await runBash(
      project,
      {
        command: `echo in > inside.txt && echo t > "$TMPDIR/t.txt" && echo ok; echo out > '${outside}/x.txt'`,
      },
      env,
      undefined,
      sandbox,
    );
    expect(result).toContain("ok");
    expect(result).toContain("Operation not permitted");
    expect(result).toContain("outside_sandbox: true");
    expect(await readFile(join(project, "inside.txt"), "utf8")).toBe("in\n");
    await expect(readFile(join(outside, "x.txt"), "utf8")).rejects.toThrow();
  });

  it("blocks the network and name lookups but keeps this computer's own addresses", async () => {
    const script = [
      "const net = require('net');",
      "net.connect(80, '93.184.215.14').on('error', (e) => console.log('REMOTE', e.code)).on('connect', () => console.log('REMOTE open'));",
      "require('dns').lookup('example.com', (e) => console.log('DNS', e ? e.code : 'resolved'));",
      "const server = net.createServer((c) => c.end('hi')).listen(0, '127.0.0.1', () => {",
      "  net.connect(server.address().port, '127.0.0.1').on('data', (d) => { console.log('LOOPBACK', String(d)); setTimeout(() => process.exit(), 300); });",
      "});",
    ].join("\n");
    await writeFile(join(project, "probe.cjs"), script);
    const result = await runBash(
      project,
      { command: `"${process.execPath}" probe.cjs` },
      env,
      undefined,
      sandbox,
    );
    expect(result).toContain("REMOTE EPERM");
    expect(result).toContain("DNS ENOTFOUND");
    expect(result).toContain("LOOPBACK hi");
  });

  it("runs outside the sandbox only when the call asks for it", async () => {
    const result = await runBash(
      project,
      { command: `echo out > '${outside}/y.txt' && echo written`, outside_sandbox: true },
      env,
      undefined,
      sandbox,
    );
    expect(result).toContain("written");
    expect(await readFile(join(outside, "y.txt"), "utf8")).toBe("out\n");
  });
});

describe("Claude Code sandbox settings", () => {
  it("turn on its sandbox with no network hosts and approval to leave it", () => {
    expect(JSON.parse(CLAUDE_SANDBOX_SETTINGS)).toEqual({
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: true,
        network: { allowedDomains: [], strictAllowlist: true },
      },
    });
  });
});
