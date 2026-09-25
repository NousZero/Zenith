import { isAllowedPageUrl } from "./browser-address";

// The built-in browser's tabs: the rules main and the window both need, kept apart so they can be
// tested on their own. The strip's own order, cycling and Cmd+digit rules are the session tabs'
// ones in `src/renderer/tabList.ts`.

// Enough for real browsing, and a ceiling on what a page opening new windows can cost.
export const MAX_BROWSER_TABS = 20;

// The tabs as the window saves them between restarts: their addresses in strip order, a blank
// tab as "", and the index of the one that was showing.
export interface SavedBrowserTabs {
  urls: string[];
  active: number;
}

// What the window saved, read without trusting it: only http and https addresses and blank tabs
// come back, at most the cap, and always at least one tab.
export function restorableTabs(saved: unknown): SavedBrowserTabs {
  const record =
    typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
  const list: unknown[] = Array.isArray(record["urls"]) ? record["urls"] : [];
  const urls = list
    .filter(
      (url): url is string => typeof url === "string" && (url === "" || isAllowedPageUrl(url)),
    )
    .map((url) => (url === "about:blank" ? "" : url))
    .slice(0, MAX_BROWSER_TABS);
  if (urls.length === 0) return { urls: [""], active: 0 };
  const active = record["active"];
  return {
    urls,
    active: Number.isInteger(active) ? Math.min(Math.max(active as number, 0), urls.length - 1) : 0,
  };
}

// A tab key the browser page acts on: a new tab, closing the open one, the address field, the
// next or previous tab, or a tab by its number (1 to 9).
export type BrowserShortcut = "new" | "close" | "address" | "next" | "previous" | number;

export interface KeyPress {
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

// Main reads keys pressed inside a web page and the window reads its own with the same rule, so
// the tab keys behave the same wherever the focus is.
export function browserShortcut(press: KeyPress, isMac: boolean): BrowserShortcut | null {
  if (press.control && press.key === "Tab") return press.shift ? "previous" : "next";
  if (!(isMac ? press.meta : press.control) || press.shift || press.alt) return null;
  const key = press.key.toLowerCase();
  if (/^[1-9]$/.test(key)) return Number(key);
  return key === "t" ? "new" : key === "w" ? "close" : key === "l" ? "address" : null;
}
