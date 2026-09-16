import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  attributeList,
  attributeText,
  isCommandName,
  parseFrontMatter,
  serializeDocument,
  type LibraryItem,
  type LibraryKind,
  type LibrarySource,
} from "../shared/library";

const MAX_DEPTH = 4;
const MAX_ITEMS_PER_ROOT = 500;
const MAX_FILE_BYTES = 256_000;
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build"]);

interface Root {
  kind: LibraryKind;
  source: LibrarySource;
  directory: string;
}

// Folders searched for each kind, following Claude Code, OpenCode, and Hermes Agent layouts.
function rootsFor(base: string, source: LibrarySource, layout: "claude" | "opencode"): Root[] {
  const names: Record<LibraryKind, string[]> =
    layout === "claude"
      ? { skill: ["skills"], command: ["commands"], agent: ["agents"] }
      : {
          skill: ["skill", "skills"],
          command: ["command", "commands"],
          agent: ["agent", "agents"],
        };
  return (Object.keys(names) as LibraryKind[]).flatMap((kind) =>
    names[kind].map((name) => ({ kind, source, directory: join(base, name) })),
  );
}

export function libraryRoots(options: {
  zenithDir: string;
  home: string;
  projectPaths: readonly string[];
}): Root[] {
  const { home } = options;
  return [
    ...rootsFor(options.zenithDir, "zenith", "claude"),
    ...options.projectPaths.flatMap((project) => [
      ...rootsFor(join(project, ".zenith"), "project", "claude"),
      ...rootsFor(join(project, ".claude"), "project", "claude"),
      ...rootsFor(join(project, ".opencode"), "project", "opencode"),
      {
        kind: "skill" as const,
        source: "project" as const,
        directory: join(project, ".agents", "skills"),
      },
    ]),
    ...rootsFor(join(home, ".claude"), "claude", "claude"),
    ...rootsFor(join(home, ".config", "opencode"), "opencode", "opencode"),
    { kind: "skill", source: "hermes", directory: join(home, ".hermes", "skills") },
  ];
}

async function walk(
  directory: string,
  depth: number,
  found: string[],
  pattern: (name: string) => boolean,
) {
  if (depth > MAX_DEPTH || found.length >= MAX_ITEMS_PER_ROOT) return;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (found.length >= MAX_ITEMS_PER_ROOT) return;
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) {
      await walk(path, depth + 1, found, pattern);
    } else if (entry.isFile() && pattern(entry.name)) {
      found.push(path);
    }
  }
}

async function readSmall(path: string): Promise<string | undefined> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size > MAX_FILE_BYTES) return undefined;
  return readFile(path, "utf8").catch(() => undefined);
}

function nameFor(kind: LibraryKind, root: string, path: string, declared: string): string {
  const fromPath = relative(root, path).slice(0, -extname(path).length).split(sep).join(":");
  // Agents are picked from a list, so display names like "Code Reviewer" are fine.
  if (kind === "agent") return declared.trim().slice(0, 100) || fromPath;
  if (kind === "skill") return isCommandName(declared) ? declared : basename(dirname(path));
  // Commands in subfolders get "folder:name", as Claude Code namespaces them.
  return fromPath;
}

export function createLibraryStore(options: { zenithDir: string; home: string }) {
  // Files the renderer may read: only those found by the latest scan.
  let known = new Map<string, LibraryItem>();

  async function scanRoot(root: Root): Promise<LibraryItem[]> {
    const files: string[] = [];
    await walk(root.directory, 0, files, (name) =>
      root.kind === "skill" ? name === "SKILL.md" : name.endsWith(".md"),
    );
    const items: LibraryItem[] = [];
    for (const path of files) {
      const text = await readSmall(path);
      if (text === undefined) continue;
      const document = parseFrontMatter(text);
      const name = nameFor(root.kind, root.directory, path, attributeText(document, "name"));
      if (
        root.kind === "agent"
          ? name === "" || [...name].some((character) => character.charCodeAt(0) < 32)
          : !isCommandName(name)
      ) {
        continue;
      }
      const tools = attributeList(document, "tools");
      const hint = attributeText(document, "argument-hint");
      items.push({
        kind: root.kind,
        name,
        description:
          attributeText(document, "description") ||
          document.body.split("\n")[0]?.slice(0, 160) ||
          "",
        source: root.source,
        path,
        readOnly: root.source !== "zenith",
        ...(root.kind === "agent" && tools ? { tools } : {}),
        ...(hint ? { argumentHint: hint } : {}),
      });
    }
    return items;
  }

  // Deletes only files inside Zenith's own library folder.
  async function remove(path: string): Promise<void> {
    const target = resolve(path);
    const inside = relative(options.zenithDir, target);
    if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
      throw new Error("Only Zenith's own library items can be deleted.");
    }
    const folder = dirname(target);
    if (
      basename(target) === "SKILL.md" &&
      dirname(folder) === join(resolve(options.zenithDir), "skills")
    ) {
      await rm(folder, { recursive: true, force: true });
    } else {
      await rm(target, { force: true });
    }
    known.delete(path);
  }

  return {
    // Earlier roots win when names collide: Zenith, then project, then other tools.
    async list(projectPaths: readonly string[]): Promise<LibraryItem[]> {
      const roots = libraryRoots({ ...options, projectPaths });
      const seen = new Set<string>();
      const items: LibraryItem[] = [];
      for (const root of roots) {
        for (const item of await scanRoot(root)) {
          const key = `${item.kind}:${item.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
        }
      }
      known = new Map(items.map((item) => [item.path, item]));
      return items;
    },

    async read(path: string): Promise<{ item: LibraryItem; body: string }> {
      const item = known.get(path);
      if (!item) throw new Error("That library file is not in the current list.");
      const text = await readSmall(path);
      if (text === undefined) throw new Error("That library file can't be read.");
      return { item, body: parseFrontMatter(text).body };
    },

    async save(input: {
      kind: LibraryKind;
      name: string;
      description: string;
      body: string;
      tools?: string;
      previousPath?: string;
    }): Promise<string> {
      if (!["skill", "command", "agent"].includes(input.kind))
        throw new Error("Unknown library kind.");
      if (!isCommandName(input.name) || input.name.includes(":")) {
        throw new Error('Names may use letters, digits, "-", "_" and ".".');
      }
      const base = join(options.zenithDir, `${input.kind}s`);
      const path =
        input.kind === "skill"
          ? join(base, input.name, "SKILL.md")
          : join(base, `${input.name}.md`);
      const attributes: Record<string, string> = {
        ...(input.kind !== "command" ? { name: input.name } : {}),
        description: input.description,
        ...(input.kind === "agent" && input.tools ? { tools: input.tools } : {}),
      };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, serializeDocument(attributes, input.body), "utf8");
      if (input.previousPath && resolve(input.previousPath) !== resolve(path)) {
        await remove(input.previousPath);
      }
      return path;
    },

    remove,
  };
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;
