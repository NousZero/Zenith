import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { BrowserViewState } from "../shared/types";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { EmptyState } from "./EmptyState";

// The page itself is a native view that main draws over the window, and a native view covers
// everything in the page, including dialogs, popovers and menus. Radix marks each of those open
// this way, so the page steps aside while any of them is showing.
const OPEN_OVERLAY = ["dialog", "alertdialog", "menu", "listbox"]
  .map((role) => `[role="${role}"][data-state="open"]`)
  .join(", ");

function errorText(caught: unknown): string {
  return caught instanceof Error
    ? caught.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
    : String(caught);
}

export function BrowserView(props: { onTitleChange(title: string): void }) {
  const [state, setState] = useState<BrowserViewState | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [refused, setRefused] = useState("");
  const pageArea = useRef<HTMLDivElement>(null);
  // A click into the field would otherwise drop the select-all that focusing it just made.
  const keepSelection = useRef(false);
  const { onTitleChange } = props;

  useEffect(() => window.zenith.browser.onState(setState), []);
  useEffect(() => onTitleChange(state?.title ?? ""), [state?.title, onTitleChange]);

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
    setRefused("");
    window.zenith.browser.navigate(text).catch((caught: unknown) => setRefused(errorText(caught)));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background/95 px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          title="Back"
          disabled={!state?.canGoBack}
          onClick={() => void window.zenith.browser.back()}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          title="Forward"
          disabled={!state?.canGoForward}
          onClick={() => void window.zenith.browser.forward()}
        >
          <ArrowRight />
        </Button>
        {state?.loading ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Stop loading"
            title="Stop loading"
            onClick={() => void window.zenith.browser.stop()}
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
            onClick={() => void window.zenith.browser.reload()}
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
          onClick={() => void window.zenith.browser.openExternal()}
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
