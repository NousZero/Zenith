// The file tabs on the Files page, as project-relative paths in strip order with the open one.
// The list rules are the session tabs' own (tabList.ts); this adds what differs for files.

import { closeTab } from "./tabList";

export interface FileTabs {
  tabs: readonly string[];
  active: string | null;
}

const STORAGE_PREFIX = "zenith.fileTabs:";

// Closing the open tab focuses its neighbour, as a session tab does; closing another keeps focus.
export function closeFileTab(state: FileTabs, path: string): FileTabs {
  const { tabs, next } = closeTab(state.tabs, path);
  return { tabs, active: state.active === path ? next : state.active };
}

// The name a tab shows, with its folder beside it when another open file has the same name, as
// README.md and docs/README.md would. The folder is "" for a file at the top of the project.
export function fileTabLabel(
  tabs: readonly string[],
  path: string,
): { name: string; folder: string | null } {
  const name = path.split("/").at(-1) ?? path;
  const shared = tabs.some((tab) => tab !== path && tab.split("/").at(-1) === name);
  return { name, folder: shared ? (path.split("/").at(-2) ?? "") : null };
}

// Each project folder keeps its own tabs, so switching folders shows that folder's files.
export function storedFileTabs(projectPath: string): FileTabs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + projectPath) ?? "{}");
    const { tabs, active } = (parsed ?? {}) as { tabs?: unknown; active?: unknown };
    if (!Array.isArray(tabs)) return { tabs: [], active: null };
    const paths = tabs.filter((tab): tab is string => typeof tab === "string");
    return {
      tabs: paths,
      active: typeof active === "string" && paths.includes(active) ? active : (paths[0] ?? null),
    };
  } catch {
    return { tabs: [], active: null };
  }
}

export function saveFileTabs(projectPath: string, state: FileTabs): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + projectPath, JSON.stringify(state));
  } catch {
    // The tabs still work for this window; they just won't come back after a restart.
  }
}
