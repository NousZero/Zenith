import { access, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

// Runs agent shell commands inside the operating system's sandbox: no network except this
// computer's own loopback address (no DNS or other Unix sockets either, so names can't carry data
// out), and writes only inside the project folder and a temporary folder of the sandbox's own.
// Reading is not restricted.
export type SandboxKind = "seatbelt" | "bubblewrap";

const SEATBELT = "/usr/bin/sandbox-exec";

// Paths arrive as parameters (-D), so a folder name can never change the profile's meaning.
const SEATBELT_PROFILE = `(version 1)
(allow default)
(deny network*)
(allow network-outbound (remote ip "localhost:*"))
(allow network-bind (local ip "localhost:*"))
(allow network-inbound (local ip "localhost:*"))
(deny file-write*)
(allow file-write*
  (subpath (param "PROJECT"))
  (subpath (param "TEMP"))
  (literal "/dev/null")
  (literal "/dev/zero")
  (literal "/dev/tty")
  (regex #"^/dev/fd/")
  (regex #"^/dev/ttys[0-9]+$"))
`;

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function onPath(name: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  for (const folder of (env["PATH"] ?? "").split(":").filter(Boolean)) {
    const candidate = join(folder, name);
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

export async function detectSandbox(env: NodeJS.ProcessEnv): Promise<SandboxKind | undefined> {
  if (process.platform === "darwin") return (await exists(SEATBELT)) ? "seatbelt" : undefined;
  if (process.platform === "linux") {
    return (await onPath("bwrap", env)) ? "bubblewrap" : undefined;
  }
  return undefined;
}

export const SANDBOX_LABELS: Record<SandboxKind, string> = {
  seatbelt: "macOS Seatbelt",
  bubblewrap: "Linux bubblewrap",
};

// The program and arguments that run `command` with /bin/sh inside the sandbox, and the
// temporary folder it may write to (also its TMPDIR).
export async function sandboxedShell(
  kind: SandboxKind,
  projectPath: string,
  command: string,
  tempRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<{ file: string; args: string[]; tempDir: string }> {
  const project = await realpath(projectPath);
  await mkdir(tempRoot, { recursive: true });
  const tempDir = await realpath(tempRoot);
  if (kind === "seatbelt") {
    return {
      file: SEATBELT,
      args: [
        "-p",
        SEATBELT_PROFILE,
        "-D",
        `PROJECT=${project}`,
        "-D",
        `TEMP=${tempDir}`,
        "/bin/sh",
        "-c",
        command,
      ],
      tempDir,
    };
  }
  const bwrap = (await onPath("bwrap", env)) ?? "bwrap";
  return {
    file: bwrap,
    args: [
      "--ro-bind",
      "/",
      "/",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--bind",
      tempDir,
      tempDir,
      "--bind",
      project,
      project,
      "--unshare-net",
      "--die-with-parent",
      "--new-session",
      "--chdir",
      project,
      "/bin/sh",
      "-c",
      command,
    ],
    tempDir,
  };
}

// Claude Code's own sandbox, switched on for one run: sandboxed commands run without asking,
// reach no network hosts, and a blocked command can be retried outside only with approval.
export const CLAUDE_SANDBOX_SETTINGS = JSON.stringify({
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: true,
    network: { allowedDomains: [], strictAllowlist: true },
  },
});
