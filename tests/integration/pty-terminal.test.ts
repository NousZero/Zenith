import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPtyTerminals, type PtyModule } from "../../src/main/pty-terminal";

// Stands in for node-pty, which is built for Electron and can't load in these tests.
function fakePty() {
  const spawned: { file: string; options: Record<string, unknown> }[] = [];
  const written: string[] = [];
  const sizes: [number, number][] = [];
  let dataListener: ((data: string) => void) | undefined;
  let exitListener: ((event: { exitCode: number }) => void) | undefined;
  let killed = false;
  const module: PtyModule = {
    spawn(file, _args, options) {
      spawned.push({ file, options });
      return {
        onData: (listener) => (dataListener = listener),
        onExit: (listener) => (exitListener = listener),
        write: (data) => written.push(data),
        resize: (columns, rows) => sizes.push([columns, rows]),
        kill: () => (killed = true),
      };
    },
  };
  return {
    module,
    spawned,
    written,
    sizes,
    emit: (data: string) => dataListener?.(data),
    finish: (code: number) => exitListener?.({ exitCode: code }),
    killed: () => killed,
  };
}

describe("workspace terminal", () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), "zenith-pty-"));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it("starts a shell in the project, passes data both ways, and resizes within limits", async () => {
    const pty = fakePty();
    const data: string[] = [];
    const exits: number[] = [];
    const terminals = createPtyTerminals(
      { data: (_id, text) => data.push(text), exit: (_id, code) => exits.push(code) },
      () => ({ PATH: "/usr/bin" }),
      pty.module,
    );
    expect(terminals.available).toBe(true);

    const id = await terminals.start(project, 100, 30);
    expect(pty.spawned[0]?.options).toMatchObject({
      name: "xterm-256color",
      cols: 100,
      rows: 30,
      env: expect.objectContaining({ PATH: "/usr/bin", TERM: "xterm-256color" }),
    });

    pty.emit("hello\r\n");
    expect(data).toEqual(["hello\r\n"]);
    terminals.write(id, "ls\r");
    expect(pty.written).toEqual(["ls\r"]);

    // Sizes are clamped, so a collapsed panel can't ask for a zero-column terminal.
    terminals.resize(id, 0, 0);
    terminals.resize(id, 5_000, 5_000);
    expect(pty.sizes).toEqual([
      [20, 5],
      [500, 200],
    ]);

    pty.finish(0);
    expect(exits).toEqual([0]);
    terminals.stopAll();
  });

  it("refuses a folder outside the project and says so when the module is missing", async () => {
    const pty = fakePty();
    const terminals = createPtyTerminals(
      { data: () => {}, exit: () => {} },
      () => ({}),
      pty.module,
    );
    await expect(terminals.start(join(project, "..", "elsewhere"), 80, 24)).rejects.toThrow();

    const without = createPtyTerminals({ data: () => {}, exit: () => {} }, () => ({}), undefined);
    expect(without.available).toBe(false);
    await expect(without.start(project, 80, 24)).rejects.toThrow("isn't available");
  });
});
