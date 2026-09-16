import { Search } from "lucide-react";
import { useState } from "react";

import type { Command } from "./commands";
import { filterCommands } from "./commands";
import { Dialog, DialogContent, DialogTitle } from "./components/ui/dialog";
import { cn } from "./lib/utils";

export function CommandPalette(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  commands: readonly Command[];
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = filterCommands(props.commands, query);
  const active = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  function close() {
    props.onOpenChange(false);
    setQuery("");
    setActiveIndex(0);
  }

  function run(command: Command | undefined) {
    if (!command) return;
    close();
    // Commands that need text are finished in the composer.
    command.run("");
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => (open ? props.onOpenChange(true) : close())}>
      <DialogContent aria-describedby={undefined} className="top-[20%] translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={matches[active] ? `command-${matches[active].name}` : undefined}
            aria-label="Search commands"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((active + 1) % Math.max(matches.length, 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((active - 1 + matches.length) % Math.max(matches.length, 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(matches[active]);
              }
            }}
            placeholder="Type a command…"
            className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <ul id="command-palette-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {matches.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              No matching commands
            </li>
          ) : (
            matches.map((command, index) => (
              <li
                key={command.name}
                id={`command-${command.name}`}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => run(command)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13px]",
                  index === active && "bg-accent text-accent-foreground",
                )}
              >
                <command.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1">{command.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">/{command.name}</span>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
