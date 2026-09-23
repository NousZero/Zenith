import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Monitor,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { previewUrl } from "../shared/preview";
import type { WorkspaceEntry, WorkspaceFile } from "../shared/types";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";
import { Markdown } from "./Markdown";

const MARKDOWN = /\.(md|markdown|mdx)$/i;
const WEB_PAGE = /\.(html?|svg)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;

type FileView = "read" | "preview" | "source";
type Width = { id: string; label: string; px: number | null; icon: typeof Monitor };

const WIDTHS: Width[] = [
  { id: "full", label: "Full width", px: null, icon: Monitor },
  { id: "tablet", label: "Tablet width, 820px", px: 820, icon: Tablet },
  { id: "phone", label: "Phone width, 390px", px: 390, icon: Smartphone },
];

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    "",
  );
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

// Joins a link or image address in a Markdown file to the folder that file is in.
function resolveRelative(fromFile: string, target: string): string {
  const clean = target.split(/[?#]/)[0] ?? "";
  if (clean.startsWith("/")) return clean.replace(/^\/+/, "");
  const parts = fromFile.split("/").slice(0, -1);
  for (const piece of clean.split("/")) {
    if (piece === "." || piece === "") continue;
    if (piece === "..") parts.pop();
    else parts.push(piece);
  }
  return parts.join("/");
}

function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Headings of a Markdown file, for the outline beside the reading view.
function outlineOf(markdown: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    if (fenced) continue;
    const match = /^(#{1,3})\s+(.*?)\s*#*$/.exec(line);
    if (match?.[2]) {
      headings.push({ level: match[1]?.length ?? 1, text: match[2], id: headingSlug(match[2]) });
    }
  }
  return headings;
}

function FileTree(props: {
  filter: string;
  projectPath: string;
  onOpen(path: string): void;
  selected: string | null;
}) {
  const [children, setChildren] = useState<Record<string, WorkspaceEntry[]>>({});
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set([""]));

  useEffect(() => {
    let cancelled = false;
    window.zenith.workspace
      .list(props.projectPath, "")
      .then((entries) => {
        if (!cancelled) setChildren({ "": entries });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [props.projectPath]);

  async function toggle(entry: WorkspaceEntry) {
    const next = new Set(open);
    if (next.has(entry.path)) {
      next.delete(entry.path);
    } else {
      next.add(entry.path);
      if (!children[entry.path]) {
        const entries = await window.zenith.workspace
          .list(props.projectPath, entry.path)
          .catch(() => []);
        setChildren((current) => ({ ...current, [entry.path]: entries }));
      }
    }
    setOpen(next);
  }

  const needle = props.filter.trim().toLowerCase();
  function render(path: string, depth: number) {
    return (children[path] ?? [])
      .filter(
        (entry) =>
          !needle || entry.kind === "directory" || entry.name.toLowerCase().includes(needle),
      )
      .map((entry) => (
        <li key={entry.path}>
          <button
            type="button"
            onClick={() =>
              entry.kind === "directory" ? void toggle(entry) : props.onOpen(entry.path)
            }
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-1.5 rounded py-0.5 pr-2 text-left text-xs hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              props.selected === entry.path && "bg-accent",
            )}
          >
            {entry.kind === "directory" ? (
              <>
                {open.has(entry.path) ? (
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <Folder className="size-3.5 shrink-0 text-primary/80" aria-hidden />
              </>
            ) : (
              <File className="ml-4.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="truncate">{entry.name}</span>
          </button>
          {entry.kind === "directory" && open.has(entry.path) && (
            <ul>{render(entry.path, depth + 1)}</ul>
          )}
        </li>
      ));
  }

  return <ul aria-label="Project files">{render("", 0)}</ul>;
}

// The Files page: a project tree beside a full-height reader. Markdown reads as a page, web pages
// and images render in a sandboxed frame that cannot reach the network, and anything else is text.
export function FilesView(props: { projectPath: string }) {
  const [path, setPath] = useState<string | null>(null);
  const [file, setFile] = useState<WorkspaceFile | null>(null);
  const [view, setView] = useState<FileView>("read");
  const [width, setWidth] = useState<string>("full");
  const [filter, setFilter] = useState("");
  const [reloads, setReloads] = useState(0);
  const [error, setError] = useState("");

  const isMarkdown = path !== null && MARKDOWN.test(path);
  const isWebPage = path !== null && WEB_PAGE.test(path);
  const isImage = path !== null && IMAGE.test(path);

  useEffect(() => {
    if (path === null || (view !== "read" && view !== "source")) return;
    let cancelled = false;
    window.zenith.workspace
      .read(props.projectPath, path)
      .then((result) => {
        if (cancelled) return;
        setFile(result);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorText(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [props.projectPath, path, view, reloads]);

  function open(next: string) {
    setPath(next);
    setFile(null);
    setError("");
    setView(
      MARKDOWN.test(next) ? "read" : WEB_PAGE.test(next) || IMAGE.test(next) ? "preview" : "source",
    );
  }

  const views: { id: FileView; label: string }[] = [
    ...(isMarkdown ? [{ id: "read" as const, label: "Read" }] : []),
    ...(isWebPage || isImage ? [{ id: "preview" as const, label: "Preview" }] : []),
    ...(isImage && !isWebPage ? [] : [{ id: "source" as const, label: "Source" }]),
  ];
  const outline = useMemo(
    () => (view === "read" && file?.content ? outlineOf(file.content) : []),
    [view, file],
  );
  const lines = file?.content?.split("\n") ?? [];
  const frameWidth = WIDTHS.find((entry) => entry.id === width)?.px ?? null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] md:grid-cols-[260px_minmax(0,1fr)]">
      <aside
        aria-label="Project files"
        className="hidden min-h-0 flex-col border-r border-border bg-card md:flex"
      >
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            aria-label="Filter files"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter files…"
            className="h-6 min-w-0 flex-1 bg-transparent text-xs focus:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          <FileTree projectPath={props.projectPath} filter={filter} selected={path} onOpen={open} />
        </div>
      </aside>

      <section aria-label="File" className="flex min-h-0 min-w-0 flex-col bg-background">
        {path === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <FolderOpen className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-serif text-xl font-semibold tracking-tight">Read your project</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Markdown opens as a page, web pages and images render as they look, and everything
              else opens as text. Previews run offline: they can load files from{" "}
              {folderName(props.projectPath)} and reach nothing else.
            </p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                {folderName(props.projectPath)} / {path}
              </p>
              {view === "preview" && isWebPage && (
                <div className="flex items-center gap-1">
                  {WIDTHS.map((entry) => (
                    <Button
                      key={entry.id}
                      variant={width === entry.id ? "secondary" : "ghost"}
                      size="icon-xs"
                      aria-label={entry.label}
                      aria-pressed={width === entry.id}
                      onClick={() => setWidth(entry.id)}
                    >
                      <entry.icon />
                    </Button>
                  ))}
                </div>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Reload file"
                onClick={() => setReloads((value) => value + 1)}
              >
                <RefreshCw />
              </Button>
              {views.length > 1 && (
                <div role="tablist" aria-label="File view" className="flex gap-1">
                  {views.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="tab"
                      aria-selected={view === entry.id}
                      onClick={() => setView(entry.id)}
                      className={cn(
                        "cursor-pointer border px-1.5 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        view === entry.id
                          ? "border-primary/50 bg-primary/[0.08] text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {error && (
              <p role="alert" className="p-3 text-xs text-danger">
                {error}
              </p>
            )}
            {view === "preview" ? (
              <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-muted/40 p-2">
                <iframe
                  key={`${props.projectPath}:${path}:${reloads}`}
                  title={`Preview of ${path}`}
                  src={previewUrl(props.projectPath, path)}
                  sandbox="allow-scripts allow-same-origin"
                  style={frameWidth ? { width: frameWidth } : undefined}
                  className={cn(
                    "min-h-0 flex-1 border border-border bg-white",
                    frameWidth && "flex-none",
                  )}
                />
              </div>
            ) : view === "read" && file !== null && file.content !== null ? (
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden xl:grid-cols-[minmax(0,1fr)_220px]">
                <div className="min-h-0 overflow-y-auto px-8 py-6">
                  <div className="mx-auto max-w-3xl">
                    <Markdown
                      content={file.content}
                      onOpenLink={(target) => open(resolveRelative(path, target))}
                      resolveImage={(target) =>
                        /^[a-z]+:/i.test(target)
                          ? undefined
                          : previewUrl(props.projectPath, resolveRelative(path, target))
                      }
                    />
                  </div>
                </div>
                {outline.length > 1 && (
                  <nav
                    aria-label="Outline"
                    className="hidden min-h-0 overflow-y-auto border-l border-border p-4 xl:block"
                  >
                    <p className="eyebrow mb-2 text-muted-foreground">Outline</p>
                    <ul className="flex flex-col gap-1">
                      {outline.map((heading, index) => (
                        <li key={`${index}-${heading.id}`}>
                          <button
                            type="button"
                            onClick={() =>
                              document
                                .getElementById(heading.id)
                                ?.scrollIntoView({ behavior: "smooth", block: "start" })
                            }
                            style={{ paddingLeft: `${(heading.level - 1) * 10}px` }}
                            className="w-full cursor-pointer truncate text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {heading.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
              </div>
            ) : file?.content === null ? (
              <p className="p-4 text-xs text-muted-foreground">{file.reason}</p>
            ) : file === null ? (
              <p className="p-4 text-xs text-muted-foreground">Opening…</p>
            ) : (
              <pre className="min-h-0 flex-1 overflow-auto py-3 font-mono text-xs leading-relaxed">
                {lines.map((line, index) => (
                  <div key={index} className="flex">
                    <span className="w-12 shrink-0 select-none pr-4 text-right text-muted-foreground/60">
                      {index + 1}
                    </span>
                    <span className="whitespace-pre pr-4">{line || " "}</span>
                  </div>
                ))}
              </pre>
            )}
          </>
        )}
      </section>
    </div>
  );
}
