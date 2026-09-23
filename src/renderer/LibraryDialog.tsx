import { Bot, Copy, FileText, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { LibraryItem, LibraryKind } from "../shared/library";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./lib/utils";
import { Markdown } from "./Markdown";

export interface LibraryDialogState {
  kind: LibraryKind;
  // Set when choosing an agent for a pane.
  pickForPaneId?: string;
}

const KINDS: { id: LibraryKind; label: string; icon: typeof Bot; hint: string }[] = [
  { id: "skill", label: "Skills", icon: Sparkles, hint: "Use with /name in the composer." },
  {
    id: "command",
    label: "Commands",
    icon: FileText,
    hint: "Prompt templates: /name fills $ARGUMENTS.",
  },
  {
    id: "agent",
    label: "Agents",
    icon: Bot,
    hint: "Instructions a pane follows; choose one from a pane's menu.",
  },
];

const SOURCE_LABELS: Record<LibraryItem["source"], string> = {
  zenith: "Zenith",
  project: "Project",
  claude: "Claude Code",
  opencode: "OpenCode",
  hermes: "Hermes",
};

export interface LibraryDraft {
  previousPath?: string;
  name: string;
  description: string;
  tools: string;
  body: string;
}

function Editor(props: {
  kind: LibraryKind;
  draft: LibraryDraft;
  onCancel(): void;
  onSaved(path: string): void;
}) {
  const [draft, setDraft] = useState(props.draft);
  const [error, setError] = useState("");
  const update = (patch: Partial<LibraryDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  async function save() {
    try {
      const path = await window.zenith.library.save({
        kind: props.kind,
        name: draft.name.trim(),
        description: draft.description.trim(),
        body: draft.body,
        ...(props.kind === "agent" ? { tools: draft.tools.trim() } : {}),
        ...(draft.previousPath ? { previousPath: draft.previousPath } : {}),
      });
      props.onSaved(path);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
          : String(caught),
      );
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Name
        <Input
          autoFocus
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="e.g. code-review"
          className="h-8 font-mono text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Description
        <Input
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          placeholder="When to use it"
          className="h-8 text-xs"
        />
      </label>
      {props.kind === "agent" && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Tools (optional, comma-separated; empty allows the default set)
          <Input
            value={draft.tools}
            onChange={(event) => update({ tools: event.target.value })}
            placeholder="Read, Grep, Glob"
            className="h-8 font-mono text-xs"
          />
        </label>
      )}
      <label className="flex min-h-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {props.kind === "command"
          ? "Template ($ARGUMENTS, $1…$9)"
          : props.kind === "skill"
            ? "Instructions"
            : "System prompt"}
        <Textarea
          value={draft.body}
          onChange={(event) => update({ body: event.target.value })}
          className="min-h-40 flex-1 resize-none font-mono text-xs"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={draft.name.trim() === "" || draft.body.trim() === ""}
        >
          Save
        </Button>
      </div>
    </form>
  );
}

// Browses, previews, and edits one kind of library item. With pickForPaneId it also offers
// "Use in pane" for agents.
export function LibraryBrowser(props: {
  kind: LibraryKind;
  items: LibraryItem[];
  onChanged(): void;
  pickForPaneId?: string;
  onPickAgent?(paneId: string, agentPath: string | null): void;
  // Opens the editor with this draft, for example a skill made from a conversation.
  initialDraft?: LibraryDraft;
}) {
  const { kind } = props;
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; body: string } | null>(null);
  const [draft, setDraft] = useState<LibraryDraft | null>(props.initialDraft ?? null);

  const needle = query.trim().toLowerCase();
  const visible = props.items.filter(
    (item) =>
      item.kind === kind &&
      (!needle ||
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle)),
  );
  const selected = visible.find((item) => item.path === selectedPath) ?? visible[0];

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    window.zenith.library
      .read(selected.path)
      .then(({ body }) => {
        if (!cancelled) setPreview({ path: selected.path, body });
      })
      .catch(() => {
        if (!cancelled) setPreview({ path: selected.path, body: "(This file can't be read.)" });
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const body = preview && preview.path === selected?.path ? preview.body : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {KINDS.find((entry) => entry.id === kind)?.hint}
        </p>
        <div className="ml-auto flex min-w-48 items-center gap-2 border border-input bg-background px-2 rounded-md">
          <Search className="size-3.5 text-muted-foreground" aria-hidden />
          <input
            aria-label="Filter library"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter…"
            className="h-8 flex-1 bg-transparent text-xs focus:outline-none"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDraft({ name: "", description: "", tools: "", body: "" })}
        >
          <Plus />
          New
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul
          aria-label="Library items"
          className="min-h-0 overflow-y-auto rounded-lg border border-border p-1"
        >
          {visible.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing here yet.
            </li>
          ) : (
            visible.map((item) => (
              <li key={item.path}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPath(item.path);
                    setDraft(null);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    item.path === selected?.path ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs text-foreground">
                      {item.kind === "agent" ? "" : "/"}
                      {item.name}
                    </span>
                    <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                      {SOURCE_LABELS[item.source]}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {item.description}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <section aria-label="Details" className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
          {draft ? (
            <Editor
              key={draft.previousPath ?? "new"}
              kind={kind}
              draft={draft}
              onCancel={() => setDraft(null)}
              onSaved={(path) => {
                setDraft(null);
                setSelectedPath(path);
                props.onChanged();
              }}
            />
          ) : selected ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-sm font-semibold">
                  {selected.kind === "agent" ? "" : "/"}
                  {selected.name}
                </h3>
                {selected.tools && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    tools: {selected.tools.join(", ")}
                  </span>
                )}
                <div className="ml-auto flex gap-1.5">
                  {props.pickForPaneId && (
                    <Button
                      size="sm"
                      onClick={() => {
                        props.onPickAgent?.(props.pickForPaneId ?? "", selected.path);
                      }}
                    >
                      Use in pane
                    </Button>
                  )}
                  {selected.readOnly ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          name: selected.name.replaceAll(":", "-"),
                          description: selected.description,
                          tools: selected.tools?.join(", ") ?? "",
                          body,
                        })
                      }
                    >
                      <Copy />
                      Copy to Zenith
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDraft({
                            previousPath: selected.path,
                            name: selected.name,
                            description: selected.description,
                            tools: selected.tools?.join(", ") ?? "",
                            body,
                          })
                        }
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${selected.name}`}
                        onClick={() =>
                          void window.zenith.library.remove(selected.path).then(props.onChanged)
                        }
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{selected.description}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {selected.path}
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background/40 p-3 text-[13px]">
                <Markdown content={body} />
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Choose an item to see it.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function LibraryDialog(props: {
  state: LibraryDialogState | null;
  items: LibraryItem[];
  onStateChange(state: LibraryDialogState | null): void;
  onChanged(): void;
  onPickAgent(paneId: string, agentPath: string | null): void;
}) {
  const { state } = props;
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && props.onStateChange(null)}>
      <DialogContent className="h-[min(720px,88vh)] w-[min(1000px,calc(100vw-48px))] gap-4">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle>Choose an agent</DialogTitle>
          <DialogDescription>
            The pane follows the agent's instructions and tool list. Edit agents on the Agents page.
          </DialogDescription>
        </div>
        {state && (
          <LibraryBrowser
            kind="agent"
            items={props.items}
            onChanged={props.onChanged}
            {...(state.pickForPaneId ? { pickForPaneId: state.pickForPaneId } : {})}
            onPickAgent={(paneId, path) => {
              props.onPickAgent(paneId, path);
              props.onStateChange(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
