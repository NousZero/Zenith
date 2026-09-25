import { ArrowLeft, ArrowRight, ExternalLink, Globe, Plus, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { browserShortcut, type BrowserShortcut } from "../shared/browser-tabs";
import type { BrowserTabs, BrowserTabState } from "../shared/types";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { EmptyState } from "./EmptyState";
import { cn } from "./lib/utils";
import { cycleTab, tabForDigit } from "./tabList";

const isMac = navigator.userAgent.includes("Mac");
const STORAGE_KEY = "zenith.browserTabs";

// The page itself is a native view that main draws over the window, and a native view covers
// everything in the page, including dialogs, popovers and menus. Radix marks each of those open
// this way, so the page steps aside while any of them is showing.
const OPEN_OVERLAY = ["dialog", "alertdialog", "menu", "listbox"]
  .map((role) => `[role="${role}"][data-state="open"]`)
  .join(", ");

// The tabs saved when Zenith last closed, left for main to check (see restorableTabs).
function storedBrowserTabs(): unknown {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function saveBrowserTabs({ tabs, activeId }: BrowserTabs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        urls: tabs.map((tab) => (tab.url === "about:blank" ? "" : tab.url)),
        active: Math.max(
          tabs.findIndex((tab) => tab.id === activeId),
          0,
        ),
      }),
    );
  } catch {
    // The tabs still work for this window; they just won't come back after a restart.
  }
}

function tabLabel(tab: BrowserTabState): string {
  return tab.title || tab.url.replace(/^https?:\/\//, "").replace(/^about:blank$/, "") || "New tab";
}

function errorText(caught: unknown): string {
  return caught instanceof Error
    ? caught.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
    : String(caught);
}

export function BrowserView(props: { onTitleChange(title: string): void }) {
  const [browser, setBrowser] = useState<BrowserTabs | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [refused, setRefused] = useState("");
  const pageArea = useRef<HTMLDivElement>(null);
  const address = useRef<HTMLInputElement>(null);
  const activeTab = useRef<HTMLButtonElement>(null);
  // A click into the field would otherwise drop the select-all that focusing it just made.
  const keepSelection = useRef(false);
  // Set when a new tab is asked for, so the address field takes the focus once it is showing.
  const focusAddressOnSwitch = useRef(false);
  const onShortcut = useRef<(shortcut: BrowserShortcut) => void>(undefined);
  const { onTitleChange } = props;
  const tabs = browser?.tabs ?? [];
  const activeId = browser?.activeId ?? null;
  const state = tabs.find((tab) => tab.id === activeId) ?? null;

  // Main keeps the tabs while the window shows other pages, and after a restart has none, so
  // showing the browser page asks main for them and hands over the saved ones in case.
  useEffect(() => {
    const stop = window.zenith.browser.onState((next) => {
      setBrowser(next);
      saveBrowserTabs(next);
    });
    window.zenith.browser
      .restore(storedBrowserTabs())
      .catch((error: unknown) => console.error("Failed to open the browser tabs:", error));
    return stop;
  }, []);
  useEffect(() => onTitleChange(state?.title ?? ""), [state?.title, onTitleChange]);

  // Switching tabs leaves the address field, so it never shows one tab's text over another's.
  useEffect(() => {
    const field = address.current;
    if (!field) return;
    if (document.activeElement === field) field.blur();
    if (focusAddressOnSwitch.current) {
      focusAddressOnSwitch.current = false;
      field.focus();
    }
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  // The tab keys, whether pressed in the window or in a page (main passes those on). The session
  // tabs' own handler in App.tsx leaves them alone while this page is open.
  useEffect(() => {
    onShortcut.current = (shortcut) => {
      const ids = tabs.map((tab) => tab.id);
      if (shortcut === "new") openTab();
      else if (shortcut === "close") {
        if (activeId) void window.zenith.browser.closeTab(activeId);
      } else if (shortcut === "address") {
        address.current?.focus();
        address.current?.select();
      } else {
        const target =
          typeof shortcut === "number"
            ? tabForDigit(ids, shortcut)
            : cycleTab(ids, activeId ?? "", shortcut === "next" ? 1 : -1);
        if (target) activate(target);
      }
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Elsewhere than macOS these are the terminal's own keys, such as Ctrl+W to delete a word.
      if (
        !isMac &&
        event.key !== "Tab" &&
        event.target instanceof Element &&
        event.target.closest(".xterm")
      ) {
        return;
      }
      const shortcut = browserShortcut(
        {
          key: event.key,
          control: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          shift: event.shiftKey,
        },
        isMac,
      );
      if (shortcut === null) return;
      event.preventDefault();
      onShortcut.current?.(shortcut);
    };
    window.addEventListener("keydown", onKeyDown);
    const stop = window.zenith.browser.onShortcut((shortcut) => onShortcut.current?.(shortcut));
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      stop();
    };
  }, []);

  // Keeps the native page exactly over the page area, and hidden whenever this view is not shown
  // or something is open over it. Leaving the view only hides the page, so it is still there, at
  // the same place in its history, on the way back.
  useEffect(() => {
    const area = pageArea.current;
    if (!area) return;
    const sendBounds = () => {
      const rect = area.getBoundingClientRect();
      void window.zenith.browser.setBounds({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    let covered: boolean | null = null;
    const syncVisible = () => {
      const next = document.querySelector(OPEN_OVERLAY) !== null;
      if (next === covered) return;
      covered = next;
      void window.zenith.browser.setVisible(!next);
    };

    const resize = new ResizeObserver(sendBounds);
    resize.observe(area);
    window.addEventListener("resize", sendBounds);
    const overlays = new MutationObserver(syncVisible);
    overlays.observe(document.body, {
      attributeFilter: ["data-state", "role"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    sendBounds();
    syncVisible();
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", sendBounds);
      overlays.disconnect();
      void window.zenith.browser.setVisible(false);
    };
  }, []);

  const url = state?.url === "about:blank" ? "" : (state?.url ?? "");

  function navigate(text: string) {
    if (!activeId) return;
    setRefused("");
    window.zenith.browser
      .navigate(activeId, text)
      .catch((caught: unknown) => setRefused(errorText(caught)));
  }

  // A toolbar button's action on the open tab.
  function onActive(run: (tabId: string) => Promise<void>) {
    return () => {
      if (activeId) void run(activeId);
    };
  }

  function activate(id: string) {
    setRefused("");
    void window.zenith.browser.activate(id);
  }

  function openTab() {
    setRefused("");
    focusAddressOnSwitch.current = true;
    window.zenith.browser.newTab().catch((caught: unknown) => {
      focusAddressOnSwitch.current = false;
      setRefused(errorText(caught));
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        <div
          role="tablist"
          aria-label="Open pages"
          className="flex min-w-0 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none]"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            const label = tabLabel(tab);
            return (
              <div
                key={tab.id}
                className={cn(
                  "group relative flex h-7 w-52 min-w-28 shrink items-center rounded-md text-[12px] transition-[background-color,box-shadow,color] duration-200",
                  active
                    ? "bg-popover/80 text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.07),0_0_0_0.5px_hsl(var(--border)),0_1px_3px_rgb(0_0_0/0.3)] backdrop-blur-xl"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  ref={active ? activeTab : undefined}
                  aria-selected={active}
                  title={label}
                  onClick={() => !active && activate(tab.id)}
                  className="flex h-full min-w-0 flex-1 cursor-pointer items-center rounded-md pl-2.5 pr-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  title={`Close tab (${isMac ? "⌘" : "Ctrl+"}W)`}
                  onClick={() => void window.zenith.browser.closeTab(tab.id)}
                  className={cn(
                    "absolute right-1 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="New tab"
          title={`New tab (${isMac ? "⌘" : "Ctrl+"}T)`}
          onClick={openTab}
        >
          <Plus />
        </Button>
      </div>
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background/95 px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          title="Back"
          disabled={!state?.canGoBack}
          onClick={onActive(window.zenith.browser.back)}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          title="Forward"
          disabled={!state?.canGoForward}
          onClick={onActive(window.zenith.browser.forward)}
        >
          <ArrowRight />
        </Button>
        {state?.loading ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Stop loading"
            title="Stop loading"
            onClick={onActive(window.zenith.browser.stop)}
          >
            <X />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reload"
            title="Reload"
            disabled={!url}
            onClick={onActive(window.zenith.browser.reload)}
          >
            <RotateCw />
          </Button>
        )}
        <form
          className="mx-1 min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft === null || !draft.trim()) return;
            navigate(draft);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <Input
            ref={address}
            aria-label="Address"
            placeholder="Search or type an address"
            spellCheck={false}
            autoComplete="off"
            className="h-7 rounded-full px-3.5 text-[12.5px]"
            value={draft ?? url}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => {
              setDraft(url);
              event.currentTarget.select();
              keepSelection.current = true;
            }}
            onMouseUp={(event) => {
              if (keepSelection.current) event.preventDefault();
              keepSelection.current = false;
            }}
            onBlur={() => {
              setDraft(null);
              keepSelection.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
          />
        </form>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open in your browser"
          title="Open in your browser"
          disabled={!url}
          onClick={onActive(window.zenith.browser.openExternal)}
        >
          <ExternalLink />
        </Button>
      </div>
      {(refused || state?.error) && (
        <p role="alert" className="shrink-0 border-b border-border px-4 py-1.5 text-xs text-danger">
          {refused || `The page could not be loaded (${state?.error}).`}
        </p>
      )}
      <div ref={pageArea} className="min-h-0 flex-1">
        {!url && (
          <EmptyState
            icon={Globe}
            title="Browse without leaving Zenith"
            description="Type an address, or words to search for with DuckDuckGo."
          />
        )}
      </div>
    </div>
  );
}
