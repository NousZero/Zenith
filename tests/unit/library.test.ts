import { describe, expect, it } from "vitest";

import {
  attributeList,
  attributeText,
  buildSkillPrompt,
  expandCommand,
  parseFrontMatter,
  serializeDocument,
} from "../../src/shared/library";

describe("parseFrontMatter", () => {
  it("reads scalars, inline lists, block lists, and block text", () => {
    const document = parseFrontMatter(
      [
        "---",
        "name: code-reviewer",
        'description: "Reviews code: carefully"',
        "tools: Read, Grep",
        "models: [haiku, sonnet]",
        "allowed:",
        "  - Edit",
        "  - Bash",
        "summary: >-",
        "  Fast browser for QA.",
        "  Use when testing a site.",
        "version: 1",
        "---",
        "",
        "You review code.",
      ].join("\n"),
    );
    expect(attributeText(document, "name")).toBe("code-reviewer");
    expect(attributeText(document, "description")).toBe("Reviews code: carefully");
    expect(attributeList(document, "tools")).toEqual(["Read", "Grep"]);
    expect(attributeList(document, "models")).toEqual(["haiku", "sonnet"]);
    expect(attributeList(document, "allowed")).toEqual(["Edit", "Bash"]);
    expect(attributeText(document, "summary")).toBe(
      "Fast browser for QA. Use when testing a site.",
    );
    expect(attributeText(document, "version")).toBe("1");
    expect(document.body).toBe("You review code.");
  });

  it("treats a file without front matter as body only", () => {
    expect(parseFrontMatter("Just text\n")).toEqual({ attributes: {}, body: "Just text" });
  });

  it("round-trips what it writes", () => {
    const text = serializeDocument({ name: "x", description: "Does: things", empty: "" }, "Body");
    const document = parseFrontMatter(text);
    expect(attributeText(document, "description")).toBe("Does: things");
    expect(document.attributes).not.toHaveProperty("empty");
    expect(document.body).toBe("Body");
  });
});

describe("expandCommand", () => {
  it("fills $ARGUMENTS and positional words", () => {
    expect(expandCommand("Review $1 then $2. Notes: $ARGUMENTS", "a.ts b.ts")).toBe(
      "Review a.ts then b.ts. Notes: a.ts b.ts",
    );
    expect(expandCommand("Fix $1 and $2", "only")).toBe("Fix only and");
  });

  it("appends arguments to templates without placeholders", () => {
    expect(expandCommand("Write tests.\n", "for the parser")).toBe(
      "Write tests.\n\nfor the parser",
    );
    expect(expandCommand("Write tests.", "")).toBe("Write tests.");
  });
});

describe("buildSkillPrompt", () => {
  it("wraps the skill with its folder and the task", () => {
    const prompt = buildSkillPrompt(
      { name: "pdf", path: "/skills/pdf/SKILL.md" },
      "Steps",
      "merge files",
    );
    expect(prompt).toContain('<skill name="pdf" folder="/skills/pdf">\nSteps\n</skill>');
    expect(prompt).toContain("Task: merge files");
  });
});
