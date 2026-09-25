import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeFileTab,
  fileTabLabel,
  saveFileTabs,
  storedFileTabs,
} from "../../src/renderer/fileTabs";

describe("file tabs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("focuses the neighbour when the open tab closes, and keeps focus when another does", () => {
    const state = { tabs: ["a.md", "b.md", "c.md"], active: "b.md" };
    expect(closeFileTab(state, "b.md")).toEqual({ tabs: ["a.md", "c.md"], active: "c.md" });
    expect(closeFileTab(state, "a.md")).toEqual({ tabs: ["b.md", "c.md"], active: "b.md" });
    expect(closeFileTab({ tabs: ["a.md"], active: "a.md" }, "a.md")).toEqual({
      tabs: [],
      active: null,
    });
  });

  it("names the folder only when two open files share a name", () => {
    const tabs = ["README.md", "docs/README.md", "src/app/main.ts"];
    expect(fileTabLabel(tabs, "docs/README.md")).toEqual({ name: "README.md", folder: "docs" });
    expect(fileTabLabel(tabs, "README.md")).toEqual({ name: "README.md", folder: "" });
    expect(fileTabLabel(tabs, "src/app/main.ts")).toEqual({ name: "main.ts", folder: null });
  });

  it("keeps each project folder's tabs apart and restores the open one", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    saveFileTabs("/one", { tabs: ["a.md", "b.md"], active: "b.md" });
    saveFileTabs("/two", { tabs: ["c.md"], active: "c.md" });
    expect(storedFileTabs("/one")).toEqual({ tabs: ["a.md", "b.md"], active: "b.md" });
    expect(storedFileTabs("/two")).toEqual({ tabs: ["c.md"], active: "c.md" });
    expect(storedFileTabs("/three")).toEqual({ tabs: [], active: null });
  });

  it("starts with no tabs when storage is unavailable or holds something else", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveFileTabs("/one", { tabs: ["a.md"], active: "a.md" })).not.toThrow();
    expect(storedFileTabs("/one")).toEqual({ tabs: [], active: null });
    vi.stubGlobal("localStorage", { getItem: () => '{"tabs":"a.md"}' });
    expect(storedFileTabs("/one")).toEqual({ tabs: [], active: null });
    vi.stubGlobal("localStorage", { getItem: () => '{"tabs":["a.md",3],"active":"gone.md"}' });
    expect(storedFileTabs("/one")).toEqual({ tabs: ["a.md"], active: "a.md" });
  });
});
