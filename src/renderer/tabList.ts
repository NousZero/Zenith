// The session tabs in the top bar, as session ids in strip order. The rules live here, apart from
// the window, so they can be tested on their own; App.tsx holds the list and the open session.

const STORAGE_KEY = "zenith.sessionTabs";

// Opening a session that already has a tab only focuses it; a new one goes at the end.
export function openTab(tabs: readonly string[], id: string): readonly string[] {
  return tabs.includes(id) ? tabs : [...tabs, id];
}

// Removes a tab and names the one that takes focus if it was the open one: the tab to its right,
// as in Safari, or the one to its left when it was last. Null when no tab is left.
export function closeTab(
  tabs: readonly string[],
  id: string,
): { tabs: readonly string[]; next: string | null } {
  const index = tabs.indexOf(id);
  if (index === -1) return { tabs, next: tabs[0] ?? null };
  const rest = tabs.filter((tab) => tab !== id);
  return { tabs: rest, next: rest[Math.min(index, rest.length - 1)] ?? null };
}

// The tab `step` places from the open one, wrapping at either end, for Ctrl+Tab and Ctrl+Shift+Tab.
export function cycleTab(tabs: readonly string[], activeId: string, step: number): string | null {
  if (tabs.length === 0) return null;
  const index = Math.max(tabs.indexOf(activeId), 0);
  return tabs[(((index + step) % tabs.length) + tabs.length) % tabs.length] ?? null;
}

// Cmd+1 to Cmd+8 go to that tab; Cmd+9 always goes to the last, as in Safari.
export function tabForDigit(tabs: readonly string[], digit: number): string | null {
  return (digit === 9 ? tabs.at(-1) : tabs[digit - 1]) ?? null;
}

// The tabs open when Zenith last closed, without sessions deleted since.
export function storedTabs(existingIds: readonly string[]): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && existingIds.includes(id));
  } catch {
    return [];
  }
}

export function saveTabs(tabs: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // The tabs still work for this window; they just won't come back after a restart.
  }
}
