import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "./components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { cn } from "./lib/utils";

const UNTITLED_SESSION = "Untitled session";
const isMac = navigator.userAgent.includes("Mac");

// The open sessions as Safari-like tabs in the top bar. The tabs and the gaps between them sit in
// the window's drag handle: the buttons and the rename field opt out, so the empty strip still
// moves the window.
export function SessionTabs(props: {
  tabs: readonly string[];
  activeId: string;
  activeName: string;
  // Live state of the open session, as the rail shows it; other tabs are not running.
  activeStatus: "running" | "waiting" | "idle";
  onSelect(id: string): void;
  onClose(id: string): void;
  onCreate(): void;
  onRename(name: string): void;
  onRenameEnd(): void;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const activeTab = useRef<HTMLButtonElement>(null);
  const tabsKey = props.tabs.join("\n");

  // Tabs other than the open one show their saved topic, re-read whenever the tabs or the open
  // session change, as the rail does. Switching saves the session being left first.
  useEffect(() => {
    let cancelled = false;
    window.zenith.sessions
      .list()
      .then((list) => {
        if (!cancelled) setNames(Object.fromEntries(list.map((item) => [item.id, item.name])));
      })
      .catch((error: unknown) => console.error("Failed to list sessions:", error));
    return () => {
      cancelled = true;
    };
  }, [tabsKey, props.activeId]);

  // Keep the open tab in view when many tabs make the strip scroll.
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tabsKey, props.activeId]);

  return (
    <div className="flex h-full min-w-0 items-center gap-1 px-3">
      <div
        role="tablist"
        aria-label="Open sessions"
        className="flex min-w-0 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none]"
      >
        {props.tabs.map((id) => {
          const active = id === props.activeId;
          const name = (active ? props.activeName : names[id]) || UNTITLED_SESSION;
          const status = active ? props.activeStatus : "idle";
          return (
            <div
              key={id}
              className={cn(
                "group relative flex h-7 w-52 min-w-28 shrink items-center rounded-md text-[12px] transition-[background-color,box-shadow,color] duration-200",
                active
                  ? "bg-popover/80 text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.07),0_0_0_0.5px_hsl(var(--border)),0_1px_3px_rgb(0_0_0/0.3)] backdrop-blur-xl"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {active && renamingId === id ? (
                <input
                  aria-label="Session name"
                  autoFocus
                  value={props.activeName}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => props.onRename(event.target.value)}
                  onBlur={() => {
                    setRenamingId(null);
                    props.onRenameEnd();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
                  }}
                  className="h-full min-w-0 flex-1 rounded-md border border-ring bg-transparent px-2 text-[12px] text-foreground focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  ref={active ? activeTab : undefined}
                  aria-selected={active}
                  title={active ? `${name} (double-click to rename)` : name}
                  // A click on the open tab does nothing, so a double-click can rename it without
                  // the session reloading underneath.
                  onClick={() => !active && props.onSelect(id)}
                  onDoubleClick={() => active && setRenamingId(id)}
                  className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md pl-2.5 pr-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {status !== "idle" && (
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        status === "running"
                          ? "bg-success shadow-[0_0_0_3px_hsl(var(--success)/0.15)] motion-safe:animate-pulse"
                          : "bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]",
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {status !== "idle" && (
                    <span className="sr-only">
                      {status === "running" ? "Working" : "Needs your answer"}
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                aria-label={`Close ${name}`}
                title={`Close tab (${isMac ? "⌘" : "Ctrl+"}W)`}
                onClick={() => props.onClose(id)}
                className={cn(
                  "absolute right-1 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  active && renamingId === id && "hidden",
                )}
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="New tab" onClick={props.onCreate}>
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New session ({isMac ? "⌘" : "Ctrl+"}T)</TooltipContent>
      </Tooltip>
    </div>
  );
}
