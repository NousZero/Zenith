import { createRequire } from "node:module";

import { logError } from "./error-log";
import { insideProject } from "./workspace";

// A real terminal for the workspace panel: a pseudo-terminal, so prompts, colors, and
// full-screen programs (vim, less, top) work as they do in a terminal app. The native module is
// loaded when it is there; without it Zenith falls back to the plain command runner.
interface PtyProcess {
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  kill(signal?: string): void;
}

interface PtyModule {
  spawn(
    file: string,
    args: string[],
    options: {
      name: string;
      cols: number;
      rows: number;
      cwd: string;
      env: Record<string, string>;
    },
  ): PtyProcess;
}

export type { PtyModule };

export interface PtyEvents {
  data(id: string, data: string): void;
  exit(id: string, code: number): void;
}

function loadPty(): PtyModule | null {
  try {
    // The main process is bundled as CommonJS, where __filename is the bundle's own path.
    const from = typeof __filename === "string" ? __filename : import.meta.url;
    return createRequire(from)("node-pty") as PtyModule;
  } catch (error) {
    console.error("A real terminal is unavailable (node-pty did not load):", error);
    logError("main", error);
    return null;
  }
}

export function createPtyTerminals(
  events: PtyEvents,
  env: () => NodeJS.ProcessEnv,
  // null means node-pty is missing. Leaving the argument out (or passing undefined) loads it.
  module: PtyModule | null = loadPty(),
) {
  const pty = module;
  const sessions = new Map<string, PtyProcess>();
  let counter = 0;

  return {
    available: pty !== null,

    async start(projectPath: string, columns: number, rows: number): Promise<string> {
      if (!pty) throw new Error("A real terminal isn't available in this build.");
      const cwd = await insideProject(projectPath, "");
      const shell =
        process.platform === "win32"
          ? (process.env["COMSPEC"] ?? "cmd.exe")
          : (process.env["SHELL"] ?? "/bin/zsh");
      const id = `pty-${++counter}`;
      const variables: Record<string, string> = {};
      for (const [key, value] of Object.entries(env())) {
        if (value !== undefined) variables[key] = value;
      }
      const session = pty.spawn(shell, process.platform === "win32" ? [] : ["-l"], {
        name: "xterm-256color",
        cols: Math.max(20, Math.min(500, Math.round(columns))),
        rows: Math.max(5, Math.min(200, Math.round(rows))),
        cwd,
        env: { ...variables, TERM: "xterm-256color", COLORTERM: "truecolor", ZENITH: "1" },
      });
      sessions.set(id, session);
      session.onData((data) => events.data(id, data));
      session.onExit(({ exitCode }) => {
        sessions.delete(id);
        events.exit(id, exitCode);
      });
      return id;
    },

    write(id: string, data: string): void {
      sessions.get(id)?.write(data);
    },

    resize(id: string, columns: number, rows: number): void {
      sessions
        .get(id)
        ?.resize(
          Math.max(20, Math.min(500, Math.round(columns))),
          Math.max(5, Math.min(200, Math.round(rows))),
        );
    },

    stop(id: string): void {
      sessions.get(id)?.kill();
      sessions.delete(id);
    },

    stopAll(): void {
      for (const session of sessions.values()) session.kill();
      sessions.clear();
    },
  };
}

export type PtyTerminals = ReturnType<typeof createPtyTerminals>;
