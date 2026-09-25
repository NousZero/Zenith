import { describe, expect, it } from "vitest";

import {
  browserShortcut,
  MAX_BROWSER_TABS,
  restorableTabs,
  type KeyPress,
} from "../../src/shared/browser-tabs";

const none: KeyPress = { key: "", control: false, meta: false, alt: false, shift: false };

describe("browser tabs", () => {
  it("restores saved http and https tabs and blank ones, dropping everything else", () => {
    expect(
      restorableTabs({
        urls: [
          "https://a.test/",
          "file:///etc/passwd",
          "",
          7,
          "javascript:alert(1)",
          "about:blank",
        ],
        active: 2,
      }),
    ).toEqual({ urls: ["https://a.test/", "", ""], active: 2 });
  });

  it("always restores at least one tab, with the open one inside the list", () => {
    expect(restorableTabs(null)).toEqual({ urls: [""], active: 0 });
    expect(restorableTabs({ urls: "https://a.test/" })).toEqual({ urls: [""], active: 0 });
    expect(restorableTabs({ urls: ["https://a.test/"], active: 5 })).toEqual({
      urls: ["https://a.test/"],
      active: 0,
    });
    expect(restorableTabs({ urls: ["https://a.test/", ""], active: "1" }).active).toBe(0);
  });

  it("restores no more tabs than the cap", () => {
    const urls = Array.from({ length: 30 }, (_, index) => `https://a.test/${index}`);
    expect(restorableTabs({ urls, active: 0 }).urls).toHaveLength(MAX_BROWSER_TABS);
  });

  it("reads Cmd on macOS and Ctrl elsewhere as the tab keys", () => {
    expect(browserShortcut({ ...none, key: "t", meta: true }, true)).toBe("new");
    expect(browserShortcut({ ...none, key: "W", meta: true }, true)).toBe("close");
    expect(browserShortcut({ ...none, key: "l", control: true }, false)).toBe("address");
    expect(browserShortcut({ ...none, key: "3", meta: true }, true)).toBe(3);
    expect(browserShortcut({ ...none, key: "t", control: true }, true)).toBeNull();
    expect(browserShortcut({ ...none, key: "t", meta: true, shift: true }, true)).toBeNull();
    expect(browserShortcut({ ...none, key: "0", meta: true }, true)).toBeNull();
    expect(browserShortcut({ ...none, key: "t" }, true)).toBeNull();
  });

  it("reads Ctrl+Tab and Ctrl+Shift+Tab as the next and previous tab everywhere", () => {
    expect(browserShortcut({ ...none, key: "Tab", control: true }, true)).toBe("next");
    expect(browserShortcut({ ...none, key: "Tab", control: true, shift: true }, false)).toBe(
      "previous",
    );
  });
});
