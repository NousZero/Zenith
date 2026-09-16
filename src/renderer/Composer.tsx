import { ArrowUp, Square } from "lucide-react";
import { useRef, useState } from "react";

import type { PaneState } from "../shared/types";
import { completeCommandName, parseSlashCommand, type Command } from "./commands";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";
import { DEFAULT_CLI_MODEL_ID, providerMeta } from "./providers";

const MAX_TEXTAREA_HEIGHT_PX = 200;
const isMac = navigator.userAgent.includes("Mac");

export const COMPOSER_INPUT_ID = "composer-input";
// The library can hold hundreds of skills; the menu narrows as the name is typed.
const MAX_MENU_ITEMS = 40;

export function Composer(props: {
  panes: PaneState[];
  readyProviders: string[];
  commands: readonly Command[];
  prompt: string;
  streaming: boolean;
  onPromptChange(prompt: string): void;
  onSend(prompt: string): void;
  onStop(): void;
}) {
  const { prompt, onPromptChange: setPrompt } = props;
  const [activeIndex, setActiveIndex] = useState(0);
  const [unknownCommand, setUnknownCommand] = useState<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const slash = parseSlashCommand(prompt);
  // The menu lists commands while the name is still being typed.
  const menu =
    slash && !/\s/.test(prompt.trim().slice(1))
      ? completeCommandName(props.commands, slash.name).slice(0, MAX_MENU_ITEMS)
      : [];
  const active = Math.min(activeIndex, Math.max(menu.length - 1, 0));
  const exactCommand = slash && props.commands.find((command) => command.name === slash.name);

  const included = props.panes.filter((pane) => pane.included);
  const ready = included.filter(
    (pane) => pane.modelId !== "" && props.readyProviders.includes(pane.providerId),
  );
  const canSend = prompt.trim() !== "" && ready.length > 0;

  function resize() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }

  function choose(command: Command) {
    setActiveIndex(0);
    if (command.argument) {
      setPrompt(`/${command.name} `);
      return;
    }
    setPrompt("");
    command.run("");
  }

  function runSlash(): boolean {
    if (!slash) return false;
    const highlighted = menu[active];
    const command =
      exactCommand ??
      (slash.argument === "" && (slash.name !== "" || activeIndex > 0) ? highlighted : undefined);
    if (!command) {
      if (slash.name !== "") setUnknownCommand(slash.name);
      return true;
    }
    if (command.argument && slash.argument === "" && !exactCommand) {
      choose(command);
      return true;
    }
    setPrompt("");
    setActiveIndex(0);
    command.run(slash.argument);
    requestAnimationFrame(resize);
    return true;
  }

  function submit() {
    if (runSlash()) return;
    if (!canSend) return;
    props.onSend(prompt.trim());
    setPrompt("");
    requestAnimationFrame(resize);
  }

  return (
    <div className="relative shrink-0 border-t border-border bg-background px-4 pb-4 pt-3">
      {menu.length > 0 && (
        <ul
          id="composer-command-menu"
          role="listbox"
          aria-label="Commands"
          className="absolute bottom-full left-4 right-4 mb-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-xl shadow-black/40"
        >
          {menu.map((command, index) => (
            <li
              key={command.name}
              id={`composer-command-${command.name}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(command);
              }}
              onMouseMove={() => setActiveIndex(index)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-[13px]",
                index === active && "bg-accent text-accent-foreground",
              )}
            >
              <command.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="w-28 shrink-0 font-mono text-xs">/{command.name}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {command.title}
                {command.argument && (
                  <span className="ml-2 font-mono text-[11px] opacity-70">{command.argument}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg border border-input bg-card transition-colors duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <textarea
          ref={textareaRef}
          id={COMPOSER_INPUT_ID}
          aria-label="Broadcast prompt"
          role="combobox"
          aria-expanded={menu.length > 0}
          aria-controls="composer-command-menu"
          aria-activedescendant={menu[active] ? `composer-command-${menu[active].name}` : undefined}
          rows={1}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setUnknownCommand(undefined);
            setActiveIndex(0);
            resize();
          }}
          onKeyDown={(event) => {
            if (menu.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActiveIndex((active + step + menu.length) % menu.length);
            } else if (menu.length > 0 && event.key === "Tab") {
              event.preventDefault();
              const command = menu[active];
              if (command) setPrompt(`/${command.name}${command.argument ? " " : ""}`);
            } else if (event.key === "Escape" && slash) {
              setPrompt("");
            } else if (event.key === "Enter" && (slash || event.metaKey || event.ctrlKey)) {
              if (slash && event.shiftKey) return;
              event.preventDefault();
              submit();
            }
          }}
          placeholder={
            props.panes.length === 1
              ? "Message…  Type / for commands"
              : "Ask every included pane…  Type / for commands"
          }
          className="block max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-4 pt-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="flex items-center gap-2 px-2 pb-2 pl-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {unknownCommand !== undefined ? (
              <span className="text-xs text-warning">
                Unknown command /{unknownCommand}. Type / to see commands.
              </span>
            ) : included.length === 0 ? (
              <span className="text-xs text-warning">No panes included in broadcast.</span>
            ) : ready.length === 0 ? (
              <span className="text-xs text-warning">
                Included panes need a ready connection and a model before sending.
              </span>
            ) : (
              included.map((pane) => {
                const isReady = ready.includes(pane);
                return (
                  <span
                    key={pane.id}
                    title={isReady ? undefined : "Not ready — needs a connection or model"}
                    className={cn(
                      "flex max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]",
                      isReady ? "text-muted-foreground" : "border-dashed text-muted-foreground/50",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        providerMeta(pane.providerId).dotClass,
                        !isReady && "opacity-40",
                      )}
                    />
                    <span className="truncate font-mono">
                      {pane.modelId && pane.modelId !== DEFAULT_CLI_MODEL_ID
                        ? pane.modelId
                        : providerMeta(pane.providerId).label}
                    </span>
                  </span>
                );
              })
            )}
          </div>
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            {isMac ? "⌘" : "Ctrl"} ↵
          </kbd>
          {props.streaming ? (
            <Button size="sm" variant="secondary" onClick={props.onStop}>
              <Square className="fill-current" />
              Stop
            </Button>
          ) : (
            <Button size="sm" disabled={!canSend && !slash} onClick={submit}>
              <ArrowUp />
              {slash ? "Run" : props.panes.length === 1 ? "Send" : `Send to ${ready.length}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
