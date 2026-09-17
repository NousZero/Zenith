import { ArrowUp, ImagePlus, Square, X } from "lucide-react";
import { useRef, useState } from "react";

import { MAX_IMAGES_PER_MESSAGE, takesImages } from "../shared/images";
import type { ImageAttachment, PaneState } from "../shared/types";
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
  onSend(prompt: string, images: ImageAttachment[]): void;
  onStop(): void;
}) {
  const { prompt, onPromptChange: setPrompt } = props;
  const [activeIndex, setActiveIndex] = useState(0);
  const [unknownCommand, setUnknownCommand] = useState<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<{ ref: ImageAttachment; url: string }[]>([]);
  const [imageError, setImageError] = useState("");

  // Stores each image in Zenith's data folder and keeps a preview for this message.
  async function attach(files: readonly File[]) {
    setImageError("");
    for (const file of files.filter((item) => item.type.startsWith("image/"))) {
      if (images.length >= MAX_IMAGES_PER_MESSAGE) {
        setImageError(`Up to ${MAX_IMAGES_PER_MESSAGE} images per message.`);
        return;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        const data = btoa(binary);
        const ref = await window.zenith.attachments.save(file.type, data);
        setImages((current) =>
          current.some((item) => item.ref.id === ref.id)
            ? current
            : [...current, { ref, url: `data:${file.type};base64,${data}` }],
        );
      } catch (error: unknown) {
        setImageError(
          (error instanceof Error ? error.message : String(error)).replace(
            /^Error invoking remote method '[^']+': (?:Error: )?/,
            "",
          ),
        );
      }
    }
  }

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
  const imagesRefused = images.length > 0 && ready.some((pane) => !takesImages(pane.providerId));
  const canSend = (prompt.trim() !== "" || images.length > 0) && ready.length > 0 && !imagesRefused;

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
    props.onSend(
      prompt.trim(),
      images.map((item) => item.ref),
    );
    setPrompt("");
    setImages([]);
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
      <div
        className="rounded-lg border border-input bg-card transition-colors duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25"
        onDragOver={(event) => {
          if ([...event.dataTransfer.items].some((item) => item.type.startsWith("image/"))) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          const files = [...event.dataTransfer.files];
          if (files.some((file) => file.type.startsWith("image/"))) {
            event.preventDefault();
            void attach(files);
          }
        }}
      >
        {images.length > 0 && (
          <ul aria-label="Attached images" className="flex flex-wrap gap-2 px-3 pt-3">
            {images.map((item) => (
              <li key={item.ref.id} className="relative">
                <img
                  src={item.url}
                  alt="Attached image"
                  className="size-16 border border-border object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() =>
                    setImages((current) => current.filter((other) => other.ref.id !== item.ref.id))
                  }
                  className="absolute -right-1.5 -top-1.5 grid size-5 cursor-pointer place-items-center rounded-full border border-border bg-popover text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
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
          onPaste={(event) => {
            const files = [...event.clipboardData.files];
            if (files.some((file) => file.type.startsWith("image/"))) {
              event.preventDefault();
              void attach(files);
            }
          }}
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
            {imageError ? (
              <span className="text-xs text-danger">{imageError}</span>
            ) : imagesRefused ? (
              <span className="text-xs text-warning">
                This connection can't read images. Remove them or choose another connection.
              </span>
            ) : unknownCommand !== undefined ? (
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
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(event) => {
              void attach([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Attach images"
            title="Attach images (or paste or drop them)"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus />
          </Button>
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
