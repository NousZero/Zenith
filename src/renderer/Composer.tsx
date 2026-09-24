import {
  ArrowUp,
  Clock,
  Columns3,
  FileText,
  FolderOpen,
  ImagePlus,
  Mic,
  Monitor,
  Plus,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { MAX_IMAGES_PER_MESSAGE, takesImages } from "../shared/images";
import { insertMention, mentionQuery, rankFiles } from "../shared/mentions";
import type { ExtraId } from "./extras";
import { postureOf, type Posture } from "../shared/permissions";
import type { ImageAttachment, PaneState } from "../shared/types";
import { completeCommandName, parseSlashCommand, type Command } from "./commands";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { cn } from "./lib/utils";
import { useDictation } from "./useDictation";

const MAX_TEXTAREA_HEIGHT_PX = 200;
const isMac = navigator.userAgent.includes("Mac");

export const COMPOSER_INPUT_ID = "composer-input";
// The library can hold hundreds of skills; the menu narrows as the name is typed.
// Every command fits so each group shows; typing narrows it. Files stay short: they are ranked.
const MAX_MENU_ITEMS = 200;
const MAX_FILE_ITEMS = 12;

// One fact about what pressing send will do: which connection answers, which folder it may
// touch, and how much it may do without asking.
function Fact(props: {
  icon?: typeof FolderOpen;
  dotClass?: string;
  children: ReactNode;
  title?: string | undefined;
  dim?: boolean;
}) {
  return (
    <span
      title={props.title}
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]",
        props.dim ? "border-dashed text-muted-foreground/60" : "text-muted-foreground",
      )}
    >
      {props.icon ? (
        <props.icon className="size-3 shrink-0" aria-hidden />
      ) : (
        <span className={cn("size-1.5 shrink-0 rounded-full", props.dotClass)} />
      )}
      <span className="truncate">{props.children}</span>
    </span>
  );
}

export function Composer(props: {
  panes: PaneState[];
  readyProviders: string[];
  commands: readonly Command[];
  prompt: string;
  streaming: boolean;
  onPromptChange(prompt: string): void;
  onSend(prompt: string, images: ImageAttachment[]): void;
  onStop(): void;
  // A prompt waiting for the current reply to finish.
  queued?: string | null;
  onCancelQueue?(): void;
  // One sentence about the run in progress, shown in place of the dispatch facts.
  status?: string | null;
  // Bumped when the permission rules change, so the facts re-read them.
  permissionsVersion?: number;
  // Which extras are on (Settings › Extras); dictation and screenshots are hidden when off.
  extras?: Record<ExtraId, boolean>;
  // Receives the element the pane renders its provider, model, and folder controls into.
  onControlsSlot?: (element: HTMLElement | null) => void;
  // Opens the side-by-side comparison of assistants on this project.
  onCompare?(): void;
}) {
  const { prompt, onPromptChange: setPrompt, onControlsSlot, extras } = props;
  const dictation = useDictation((text) =>
    setPrompt(prompt.trim() ? `${prompt.trimEnd()} ${text}` : text),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [unknownCommand, setUnknownCommand] = useState<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<{ ref: ImageAttachment; url: string }[]>([]);
  const [imageError, setImageError] = useState("");
  const [sandboxed, setSandboxed] = useState(false);
  const [posture, setPosture] = useState<Posture | undefined>(undefined);
  // Project files for `@` mentions, fetched the first time one is typed in a project.
  const [projectFiles, setProjectFiles] = useState<{ project: string; files: string[] }>();
  // Caret position the mention query is read from; kept in sync on every keystroke.
  const [caret, setCaret] = useState(0);
  const projectPath = props.panes[0]?.projectPath;

  // What a send is allowed to do, read once so the composer can say it before anything happens.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.zenith.sandbox.status().catch(() => undefined),
      window.zenith.permissions.get().catch(() => ""),
    ]).then(([status, rules]) => {
      if (cancelled) return;
      if (status) setSandboxed(status.enabled && status.available !== null);
      setPosture(postureOf(rules ?? ""));
    });
    return () => {
      cancelled = true;
    };
  }, [props.permissionsVersion]);

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

  async function attachScreenshot() {
    setImageError("");
    if (images.length >= MAX_IMAGES_PER_MESSAGE) {
      setImageError(`Up to ${MAX_IMAGES_PER_MESSAGE} images per message.`);
      return;
    }
    try {
      const ref = await window.zenith.screen.capture();
      const data = await window.zenith.attachments.read(ref.id);
      setImages((current) =>
        current.some((item) => item.ref.id === ref.id)
          ? current
          : [...current, { ref, url: `data:image/png;base64,${data}` }],
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

  const slash = parseSlashCommand(prompt);
  // The menu lists commands while the name is still being typed.
  const menu =
    slash && !/\s/.test(prompt.trim().slice(1))
      ? completeCommandName(props.commands, slash.name).slice(0, MAX_MENU_ITEMS)
      : [];
  const active = Math.min(activeIndex, Math.max(menu.length - 1, 0));
  const exactCommand = slash && props.commands.find((command) => command.name === slash.name);
  const mention = slash || !projectPath ? undefined : mentionQuery(prompt, caret);
  const fileMenu =
    mention !== undefined && projectFiles && projectFiles.project === projectPath
      ? rankFiles(projectFiles.files, mention, MAX_FILE_ITEMS)
      : [];
  const activeFile = Math.min(activeIndex, Math.max(fileMenu.length - 1, 0));

  function loadFiles(nextPrompt: string, nextCaret: number) {
    if (!projectPath || projectFiles?.project === projectPath) return;
    if (mentionQuery(nextPrompt, nextCaret) === undefined) return;
    void window.zenith.workspace
      .files(projectPath)
      .then((files) => setProjectFiles({ project: projectPath, files }))
      .catch(() => setProjectFiles({ project: projectPath, files: [] }));
  }

  function pickFile(path: string) {
    setActiveIndex(0);
    const next = insertMention(prompt, caret, path);
    setPrompt(next.prompt);
    setCaret(next.caret);
    const element = textareaRef.current;
    element?.focus();
    requestAnimationFrame(() => element?.setSelectionRange(next.caret, next.caret));
  }

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
    <div className="relative mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 pt-2">
      {menu.length > 0 && (
        <ul
          id="composer-command-menu"
          role="listbox"
          aria-label="Commands"
          className="absolute bottom-full left-4 right-4 mb-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-xl shadow-black/40"
        >
          {menu.map((command, index) => [
            (command.group ?? "Zenith") !== (menu[index - 1]?.group ?? "Zenith") || index === 0 ? (
              <li
                key={`group-${command.group ?? "Zenith"}`}
                role="presentation"
                className="eyebrow px-3 pb-1 pt-2 text-muted-foreground first:pt-1"
              >
                {command.group ?? "Zenith"}
              </li>
            ) : null,
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
              <span className="w-44 shrink-0 truncate font-mono text-xs">/{command.name}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {command.title}
                {command.argument && (
                  <span className="ml-2 font-mono text-[11px] opacity-70">{command.argument}</span>
                )}
              </span>
            </li>,
          ])}
          <li
            role="presentation"
            className="sticky -bottom-1.5 -mx-1.5 mt-1 border-t border-border bg-popover px-4 py-1.5 font-mono text-[10px] text-muted-foreground"
          >
            ↑↓ move · Enter run · Tab complete · Esc close
          </li>
        </ul>
      )}
      {fileMenu.length > 0 && (
        <ul
          id="composer-file-menu"
          role="listbox"
          aria-label="Project files"
          className="absolute bottom-full left-4 right-4 mb-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-xl shadow-black/40"
        >
          {fileMenu.map((path, index) => {
            const slashAt = path.lastIndexOf("/");
            return (
              <li
                key={path}
                id={`composer-file-${index}`}
                role="option"
                aria-selected={index === activeFile}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickFile(path);
                }}
                onMouseMove={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-[13px]",
                  index === activeFile && "bg-accent text-accent-foreground",
                )}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="shrink-0 font-mono text-xs">{path.slice(slashAt + 1)}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {slashAt > 0 ? path.slice(0, slashAt) : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div
        className="rounded-xl border border-input bg-card shadow-lg shadow-black/25 transition-colors duration-150 focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/20"
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
        {props.queued && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
            <Clock className="size-3 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono">Queued · {props.queued}</span>
            <button
              type="button"
              aria-label="Cancel the queued prompt"
              onClick={props.onCancelQueue}
              className="shrink-0 cursor-pointer rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden />
            </button>
          </div>
        )}
        {images.length > 0 && (
          <ul aria-label="Attached images" className="flex flex-wrap gap-2 px-3 pt-3">
            {images.map((item) => (
              <li key={item.ref.id} className="relative">
                <img
                  src={item.url}
                  alt="Attached image"
                  className="size-16 border border-border object-cover rounded-md"
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
          aria-label="Message"
          role="combobox"
          aria-expanded={menu.length > 0 || fileMenu.length > 0}
          aria-controls={fileMenu.length > 0 ? "composer-file-menu" : "composer-command-menu"}
          aria-activedescendant={
            fileMenu.length > 0
              ? `composer-file-${activeFile}`
              : menu[active]
                ? `composer-command-${menu[active].name}`
                : undefined
          }
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
            const nextCaret = event.target.selectionStart ?? event.target.value.length;
            setPrompt(event.target.value);
            setCaret(nextCaret);
            loadFiles(event.target.value, nextCaret);
            setUnknownCommand(undefined);
            setActiveIndex(0);
            resize();
          }}
          // Arrow keys and clicks move the caret without changing the text; the picker follows it.
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (fileMenu.length > 0) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setActiveIndex((activeFile + step + fileMenu.length) % fileMenu.length);
                return;
              }
              if (
                (event.key === "Enter" && !event.metaKey && !event.ctrlKey) ||
                event.key === "Tab"
              ) {
                event.preventDefault();
                const path = fileMenu[activeFile];
                if (path) pickFile(path);
                return;
              }
            }
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
            projectPath
              ? "Message… · / for commands · @ for files"
              : "Message… · type / for commands"
          }
          className="block max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-4 pt-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="flex items-center gap-2 px-2 pb-2 pl-2">
          <span ref={onControlsSlot} className="contents" />
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
              <span className="text-xs text-warning">This pane isn't included.</span>
            ) : ready.length === 0 ? (
              <span className="text-xs text-warning">
                This pane needs a ready connection and a model before sending.
              </span>
            ) : props.streaming && props.status ? (
              <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" />
                <span className="truncate font-mono">{props.status}</span>
              </span>
            ) : props.panes[0] ? (
              <>
                {props.panes[0].projectPath && (
                  <Fact icon={ShieldCheck} title={posture?.summary}>
                    {props.panes[0].planMode
                      ? "plan only"
                      : sandboxed
                        ? "sandboxed commands"
                        : posture
                          ? posture.label.toLowerCase()
                          : "asks before changes"}
                  </Fact>
                )}
              </>
            ) : null}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Add to message"
                title="Add to message"
              >
                <Plus />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                <ImagePlus />
                Images…
                <span className="ml-auto pl-4 text-[11px] text-muted-foreground">
                  or paste, drop
                </span>
              </DropdownMenuItem>
              {extras?.screenshot && (
                <DropdownMenuItem onSelect={() => void attachScreenshot()}>
                  <Monitor />
                  Screenshot of the screen
                </DropdownMenuItem>
              )}
              {projectPath && (
                <DropdownMenuItem
                  onSelect={() => {
                    const nextPrompt = prompt.trim() ? `${prompt.trimEnd()} @` : "@";
                    setPrompt(nextPrompt);
                    setCaret(nextPrompt.length);
                    loadFiles(nextPrompt, nextPrompt.length);
                    const element = textareaRef.current;
                    element?.focus();
                    requestAnimationFrame(() =>
                      element?.setSelectionRange(nextPrompt.length, nextPrompt.length),
                    );
                  }}
                >
                  <FileText />
                  File from the project
                  <span className="ml-auto pl-4 font-mono text-[11px] text-muted-foreground">
                    @
                  </span>
                </DropdownMenuItem>
              )}
              {projectPath && props.onCompare && (
                <DropdownMenuItem onSelect={props.onCompare}>
                  <Columns3 />
                  Compare assistants…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* A recording in progress keeps its stop button even if dictation was just turned off. */}
          {(extras?.dictation || dictation.recording) && (
            <Button
              size="icon-sm"
              variant={dictation.recording ? "secondary" : "ghost"}
              disabled={dictation.busy}
              aria-label={dictation.recording ? "Stop dictating" : "Dictate a message"}
              aria-pressed={dictation.recording}
              title={dictation.problem ?? (dictation.recording ? "Stop dictating" : "Dictate")}
              onClick={() => void dictation.toggle()}
            >
              {dictation.recording ? <Square className="fill-current" /> : <Mic />}
            </Button>
          )}
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            {isMac ? "⌘" : "Ctrl"} ↵
          </kbd>
          {props.streaming && (
            <Button size="sm" variant="secondary" onClick={props.onStop}>
              <Square className="fill-current" />
              Stop
            </Button>
          )}
          <Button size="sm" disabled={!canSend && !slash} onClick={submit}>
            {props.streaming ? <Clock /> : <ArrowUp />}
            {props.streaming ? "Queue" : slash ? "Run" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
