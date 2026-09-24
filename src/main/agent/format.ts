import { access, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { execFileResolved } from "../cli/launch";

const FORMAT_TIMEOUT_MS = 15_000;
const PRETTIER_EXTENSIONS = new Set(
  ".js .jsx .mjs .cjs .ts .tsx .mts .cts .json .css .scss .less .html .vue .md .mdx .yml .yaml .graphql".split(
    " ",
  ),
);

interface Formatter {
  name: string;
  command: string;
  args: string[];
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

// The project's own formatter for a file: Biome or Prettier installed in the project, or the
// standard formatter for Go, Rust, and Python when it is on the PATH.
async function formatterFor(projectPath: string, filePath: string): Promise<Formatter | undefined> {
  const extension = extname(filePath).toLowerCase();
  // On Windows npm installs the project's tools as .cmd shims, which launch.ts runs without a shell.
  const bin = (name: string) =>
    join(projectPath, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
  if (PRETTIER_EXTENSIONS.has(extension)) {
    if (await exists(bin("biome"))) {
      return { name: "Biome", command: bin("biome"), args: ["format", "--write", filePath] };
    }
    if (await exists(bin("prettier"))) {
      return { name: "Prettier", command: bin("prettier"), args: ["--write", filePath] };
    }
    return undefined;
  }
  if (extension === ".go") return { name: "gofmt", command: "gofmt", args: ["-w", filePath] };
  if (extension === ".rs") return { name: "rustfmt", command: "rustfmt", args: [filePath] };
  if (extension === ".py") return { name: "Ruff", command: "ruff", args: ["format", filePath] };
  return undefined;
}

// Formats a file the agent just changed. Returns the formatter's name when it changed the file;
// a missing or failing formatter is ignored.
export async function formatFile(
  projectPath: string,
  filePath: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const formatter = await formatterFor(projectPath, filePath);
  if (!formatter) return undefined;
  const before = await readFile(filePath, "utf8").catch(() => undefined);
  const ok = await new Promise<boolean>((resolve) => {
    // Starting throws for a Windows batch file that isn't an npm shim, which counts as failing.
    execFileResolved(
      formatter.command,
      formatter.args,
      {
        cwd: projectPath,
        env,
        timeout: FORMAT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error) => resolve(!error),
    );
  }).catch(() => false);
  if (!ok) return undefined;
  const after = await readFile(filePath, "utf8").catch(() => undefined);
  return after !== before ? formatter.name : undefined;
}
