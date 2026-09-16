import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLibraryStore } from "../../src/main/library-store";

async function put(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

describe("library store", () => {
  let dir: string;
  let home: string;
  let project: string;
  let zenithDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-library-"));
    home = join(dir, "home");
    project = join(dir, "project");
    zenithDir = join(dir, "zenith", "library");
    await put(
      join(home, ".claude", "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Reviews code\ntools: Read, Grep\n---\nYou review.",
    );
    await put(
      join(home, ".claude", "commands", "git", "commit.md"),
      "---\ndescription: Commit\n---\nCommit $ARGUMENTS",
    );
    await put(
      join(home, ".hermes", "skills", "devops", "docker", "SKILL.md"),
      "---\nname: docker\ndescription: Docker help\n---\nUse docker.",
    );
    await put(join(project, ".opencode", "command", "test.md"), "Run the tests.");
    await put(
      join(home, ".claude", "agents", "auditor.md"),
      "---\nname: Accessibility Auditor\ndescription: Audits\n---\nAudit.",
    );
    await put(
      join(project, ".claude", "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Project reviewer\n---\nProject rules.",
    );
    await put(join(home, ".claude", "skills", "node_modules", "x", "SKILL.md"), "ignored");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds skills, commands, and agents across tools, with project items winning", async () => {
    const library = createLibraryStore({ zenithDir, home });
    const items = await library.list([project]);
    const summary = items.map(({ kind, name, source, description, tools }) => ({
      kind,
      name,
      source,
      description,
      ...(tools ? { tools } : {}),
    }));
    expect(summary).toEqual(
      expect.arrayContaining([
        { kind: "agent", name: "reviewer", source: "project", description: "Project reviewer" },
        { kind: "command", name: "test", source: "project", description: "Run the tests." },
        { kind: "command", name: "git:commit", source: "claude", description: "Commit" },
        { kind: "skill", name: "docker", source: "hermes", description: "Docker help" },
        { kind: "agent", name: "Accessibility Auditor", source: "claude", description: "Audits" },
      ]),
    );
    expect(items.filter((item) => item.name === "reviewer")).toHaveLength(1);
    expect(items.some((item) => item.path.includes("node_modules"))).toBe(false);
    expect(items.every((item) => item.readOnly)).toBe(true);
  });

  it("reads only listed files and saves, renames, and deletes Zenith's own items", async () => {
    const library = createLibraryStore({ zenithDir, home });
    await expect(library.read(join(home, ".ssh", "id_rsa"))).rejects.toThrow(
      "not in the current list",
    );

    const path = await library.save({
      kind: "skill",
      name: "summarize",
      description: "Short: summaries",
      body: "Be short.",
    });
    expect(path).toBe(join(zenithDir, "skills", "summarize", "SKILL.md"));
    const items = await library.list([]);
    const skill = items.find((item) => item.name === "summarize");
    expect(skill).toMatchObject({
      source: "zenith",
      readOnly: false,
      description: "Short: summaries",
    });
    await expect(library.read(path)).resolves.toMatchObject({ body: "Be short." });

    const renamed = await library.save({
      kind: "skill",
      name: "brief",
      description: "d",
      body: "b",
      previousPath: path,
    });
    await expect(readFile(path, "utf8")).rejects.toThrow();
    await library.remove(renamed);
    await expect(readFile(renamed, "utf8")).rejects.toThrow();

    await expect(library.remove(join(home, ".claude", "agents", "reviewer.md"))).rejects.toThrow(
      "Only Zenith's own",
    );
    await expect(
      library.save({ kind: "agent", name: "../evil", description: "", body: "" }),
    ).rejects.toThrow();
  });
});
