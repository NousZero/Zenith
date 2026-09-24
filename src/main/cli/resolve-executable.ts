import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";

export interface ExecutableEnvironment {
  env: NodeJS.ProcessEnv;
  home: string;
  platform: NodeJS.Platform;
}

// Apps launched from Finder or a desktop menu don't inherit the shell PATH,
// so common per-user install locations are searched explicitly.
export function commonBinaryDirectories({ home, platform, env }: ExecutableEnvironment): string[] {
  if (platform === "win32") {
    const appData = env["APPDATA"];
    return appData ? [join(appData, "npm")] : [];
  }
  return [
    join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(home, ".npm-global", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".volta", "bin"),
    "/usr/bin",
    "/bin",
  ];
}

function searchDirectories(environment: ExecutableEnvironment): string[] {
  const fromPath = (environment.env["PATH"] ?? "").split(delimiter).filter(Boolean);
  return [...new Set([...fromPath, ...commonBinaryDirectories(environment)])];
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveExecutable(
  name: string,
  environment: ExecutableEnvironment,
): Promise<string | undefined> {
  // On Windows, npm installs tools as .cmd shims beside their .exe siblings; launch.ts runs those
  // without a shell.
  const fileNames = environment.platform === "win32" ? [`${name}.exe`, `${name}.cmd`] : [name];
  for (const directory of searchDirectories(environment)) {
    for (const fileName of fileNames) {
      const candidate = join(directory, fileName);
      if (await isExecutableFile(candidate)) return candidate;
    }
  }
  return undefined;
}

// Node-based CLIs use `#!/usr/bin/env node`, so the child needs node's directory on PATH.
// PATH for commands an agent runs: the user's PATH plus common install folders, since an app
// started from the Finder or Start menu does not inherit the shell's PATH.
export function commandPath(environment: ExecutableEnvironment): string {
  return searchDirectories(environment).join(delimiter);
}

export function childProcessPath(
  executablePath: string,
  environment: ExecutableEnvironment,
): string {
  return [dirname(executablePath), ...searchDirectories(environment)].join(delimiter);
}
