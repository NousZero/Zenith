import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeTab,
  cycleTab,
  openTab,
  saveTabs,
  storedTabs,
  tabForDigit,
} from "../../src/renderer/tabList";

describe("session tabs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds a new session at the end and only focuses one already open", () => {
    const tabs = ["a", "b"];
    expect(openTab(tabs, "c")).toEqual(["a", "b", "c"]);
    expect(openTab(tabs, "a")).toBe(tabs);
  });

  it("moves focus to the right neighbour, or the left one when closing the last tab", () => {
    expect(closeTab(["a", "b", "c"], "b")).toEqual({ tabs: ["a", "c"], next: "c" });
    expect(closeTab(["a", "b", "c"], "c")).toEqual({ tabs: ["a", "b"], next: "b" });
    expect(closeTab(["a"], "a")).toEqual({ tabs: [], next: null });
  });

  it("cycles through tabs in both directions, wrapping at the ends", () => {
    const tabs = ["a", "b", "c"];
    expect(cycleTab(tabs, "c", 1)).toBe("a");
    expect(cycleTab(tabs, "a", -1)).toBe("c");
    expect(cycleTab(tabs, "a", 1)).toBe("b");
    expect(cycleTab([], "a", 1)).toBeNull();
  });

  it("maps Cmd+1 to Cmd+8 to that tab and Cmd+9 to the last", () => {
    const tabs = ["a", "b", "c"];
    expect(tabForDigit(tabs, 1)).toBe("a");
    expect(tabForDigit(tabs, 9)).toBe("c");
    expect(tabForDigit(tabs, 5)).toBeNull();
  });

  it("restores saved tabs in order, without sessions deleted since", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    saveTabs(["c", "gone", "a"]);
    expect(storedTabs(["a", "b", "c"])).toEqual(["c", "a"]);
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
    expect(() => saveTabs(["a"])).not.toThrow();
    expect(storedTabs(["a"])).toEqual([]);
    vi.stubGlobal("localStorage", { getItem: () => '{"a":1}' });
    expect(storedTabs(["a"])).toEqual([]);
  });
});
