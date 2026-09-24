import { Check, ChevronRight, Columns3, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  Comparison,
  ComparisonFile,
  ConnectionStatus,
  PaneState,
  PermissionRequest,
} from "../shared/types";
import { AgentPanel, DiffView } from "./AgentPanel";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Textarea } from "./components/ui/textarea";
import { leftoverNotice } from "./lib/format";
import { cn } from "./lib/utils";
import { Markdown } from "./Markdown";
import { PermissionCard } from "./Pane";
import { providerMeta } from "./providers";
import { describeSendError, type AgentTurn } from "./useHarness";

const MIN_RUNS = 2;
const MAX_RUNS = 3;

export interface ActiveComparison extends Comparison {
  sessionId: string;
  prompt: string;
  // The pane each run streams into, by provider id.
  paneIds: Record<string, string>;
  // Set once the comparison is kept or discarded: what happened, in a sentence or two.
  outcome: string | null;
}

function CompareForm(props: {
  prompt: string;
  projectPath: string | null;
  connections: ConnectionStatus[];
  onClose(): void;
  onStart(providerIds: string[], prompt: string): Promise<void>;
}) {
  const { projectPath } = props;
  const [prompt, setPrompt] = useState(props.prompt);
  const [picked, setPicked] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [leftovers, setLeftovers] = useState<{ id: string; paths: string[] }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  // Assistants that work in a folder; API providers need a model picked, so they aren't offered.
  const assistants = props.connections.filter(
    (connection) => connection.state === "ready" && connection.kind !== "api-key",
  );

  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    void Promise.all([
      window.zenith.workspace.gitStatus(projectPath),
      window.zenith.compare.leftovers(projectPath).catch(() => []),
    ])
      .then(([status, found]) => {
        if (cancelled) return;
        setLeftovers(found);
        setBlocked(
          !status.isRepository
            ? "This project folder isn't a Git repository. Comparisons run each assistant in a Git worktree."
            : status.files.length > 0
              ? `Your project has uncommitted changes (${status.files.length} ${status.files.length === 1 ? "file" : "files"}). Commit or stash them first: every assistant starts from the last commit.`
              : null,
        );
      })
      .catch((caught: unknown) => !cancelled && setBlocked(describeSendError(caught)))
      .finally(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [projectPath, version]);

  async function removeLeftovers() {
    if (!projectPath) return;
    const failed: string[] = [];
    for (const item of leftovers) {
      failed.push(
        ...(await window.zenith.compare
          .discard(projectPath, item.id)
          .catch((caught: unknown) => [`${item.paths.join(", ")} (${describeSendError(caught)})`])),
      );
    }
    setError(leftoverNotice(failed).trim());
    setVersion((value) => value + 1);
  }

  const reason = !projectPath ? "Choose a project folder for this session first." : blocked;
  const canStart =
    checked &&
    !reason &&
    !busy &&
    picked.length >= MIN_RUNS &&
    picked.length <= MAX_RUNS &&
    prompt.trim() !== "";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canStart) return;
        setBusy(true);
        setError("");
        props
          .onStart(picked, prompt.trim())
          .then(props.onClose)
          .catch((caught: unknown) => setError(describeSendError(caught)))
          .finally(() => setBusy(false));
      }}
    >
      {reason && (
        <p
          role="alert"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
        >
          {reason}
        </p>
      )}
      {leftovers.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
          <p className="min-w-0 flex-1 text-muted-foreground">
            An earlier comparison left worktrees behind:{" "}
            <span className="break-all font-mono text-[11px] text-foreground">
              {leftovers.flatMap((item) => item.paths).join(", ")}
            </span>
          </p>
          <Button size="xs" variant="outline" onClick={() => void removeLeftovers()}>
            <Trash2 />
            Remove
          </Button>
        </div>
      )}
      <div role="group" aria-label="Assistants to compare" className="flex flex-col gap-1.5">
        <p className="eyebrow text-muted-foreground">Assistants · pick two or three</p>
        {assistants.length < MIN_RUNS && (
          <p className="text-xs text-muted-foreground">
            Only {assistants.length} assistant {assistants.length === 1 ? "is" : "are"} ready on
            this computer. Set up another in Settings › Assistants.
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {assistants.map((connection) => {
            const on = picked.includes(connection.id);
            const full = !on && picked.length >= MAX_RUNS;
            return (
              <button
                key={connection.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={full}
                onClick={() =>
                  setPicked((current) =>
                    on ? current.filter((id) => id !== connection.id) : [...current, connection.id],
                  )
                }
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  on ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    providerMeta(connection.id).dotClass,
                  )}
                />
                <span className="truncate">{connection.label}</span>
                {on && <Check className="ml-auto size-3.5 shrink-0 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
      <Textarea
        autoFocus
        aria-label="Prompt for every assistant"
        placeholder="What should each assistant do?"
        rows={4}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        className="resize-y"
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={props.onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canStart}>
          <Columns3 />
          {busy ? "Starting…" : "Compare"}
        </Button>
      </div>
    </form>
  );
}

export function CompareDialog(props: {
  // The prompt to start from; null while closed.
  prompt: string | null;
  projectPath: string | null;
  connections: ConnectionStatus[];
  onClose(): void;
  onStart(providerIds: string[], prompt: string): Promise<void>;
}) {
  return (
    <Dialog open={props.prompt !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compare assistants</DialogTitle>
          <DialogDescription>
            Each assistant gets the same prompt and works in its own copy of the project (a Git
            worktree from the last commit), so they can't get in each other's way. You keep one
            result; the rest are thrown away.
          </DialogDescription>
        </DialogHeader>
        {props.prompt !== null && (
          <CompareForm
            prompt={props.prompt}
            projectPath={props.projectPath}
            connections={props.connections}
            onClose={props.onClose}
            onStart={props.onStart}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type RunStatus = "running" | "waiting" | "done" | "failed";
const STATUS: Record<RunStatus, { label: string; className: string }> = {
  running: { label: "Running", className: "bg-primary motion-safe:animate-pulse" },
  waiting: { label: "Waiting for approval", className: "bg-warning" },
  done: { label: "Done", className: "bg-success" },
  failed: { label: "Failed", className: "bg-danger" },
};

function FileRow({ file }: { file: ComparisonFile }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left font-mono text-[11px] hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{file.path}</span>
        {file.added === null ? (
          <span className="text-muted-foreground">binary</span>
        ) : (
          <>
            <span className="text-success">+{file.added}</span>
            <span className="text-danger">−{file.removed}</span>
          </>
        )}
      </button>
      {open && (
        <DiffView
          diff={file.diff
            .split("\n")
            .filter((line) => !line.startsWith("diff --git ") && !line.startsWith("index "))
            .join("\n")}
        />
      )}
    </li>
  );
}

function RunColumn(props: {
  comparison: ActiveComparison;
  providerId: string;
  pane: PaneState | undefined;
  streaming: boolean;
  turn: AgentTurn | undefined;
  permissions: PermissionRequest[];
  hidden: boolean;
  busy: boolean;
  onRespondPermission(permissionId: string, optionId: string | null): void;
  onKeep(): void;
}) {
  const { comparison, providerId, pane } = props;
  const [files, setFiles] = useState<ComparisonFile[] | null>(null);
  const [filesError, setFilesError] = useState("");
  // Until its first message the run is still starting, not finished.
  const running = props.streaming || !pane || (pane.messages.length === 0 && !pane.lastError);
  const status: RunStatus =
    props.permissions.length > 0
      ? "waiting"
      : running
        ? "running"
        : pane?.lastError
          ? "failed"
          : "done";
  const reply = pane?.messages.findLast((message) => message.role === "assistant")?.content;
  const finished = !running && comparison.outcome === null;

  // The changes are read once the run ends; an assistant still working has nothing final to show.
  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    window.zenith.compare
      .changes(comparison.projectPath, comparison.id, providerId)
      .then((list) => !cancelled && setFiles(list))
      .catch((caught: unknown) => !cancelled && setFilesError(describeSendError(caught)));
    return () => {
      cancelled = true;
    };
  }, [finished, comparison.projectPath, comparison.id, providerId]);

  return (
    <section
      aria-label={providerMeta(providerId).label}
      className={cn(
        "min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card",
        props.hidden ? "hidden lg:flex" : "flex",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={cn("size-2 shrink-0 rounded-full", providerMeta(providerId).dotClass)} />
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {providerMeta(providerId).label}
        </h3>
        <span
          role="status"
          className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <span className={cn("size-1.5 rounded-full", STATUS[status].className)} aria-hidden />
          {STATUS[status].label}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-[13px]">
        {props.permissions.map((request) => (
          <PermissionCard
            key={request.permissionId}
            request={request}
            onRespond={(optionId) => props.onRespondPermission(request.permissionId, optionId)}
          />
        ))}
        {props.turn && (
          <AgentPanel turn={props.turn} streaming={props.streaming} onRollback={async () => {}} />
        )}
        {reply ? (
          <Markdown content={reply} />
        ) : (
          running && <p className="text-xs text-muted-foreground">Thinking…</p>
        )}
        {pane?.lastError && <p className="text-xs text-danger">{pane.lastError}</p>}
      </div>
      <footer className="flex max-h-[45%] flex-col gap-2 border-t border-border p-3">
        <p className="eyebrow text-muted-foreground">
          {running
            ? "Changes appear when it finishes"
            : files === null
              ? "Changes"
              : `${files.length} ${files.length === 1 ? "file" : "files"} changed`}
        </p>
        {filesError && <p className="text-xs text-danger">{filesError}</p>}
        {files && files.length > 0 && (
          <ul aria-label="Changed files" className="flex min-h-0 flex-col overflow-y-auto">
            {files.map((file) => (
              <FileRow key={file.path} file={file} />
            ))}
          </ul>
        )}
        <Button
          size="sm"
          disabled={running || props.busy || comparison.outcome !== null}
          onClick={props.onKeep}
        >
          <Check />
          Keep this one
        </Button>
      </footer>
    </section>
  );
}

export function CompareView(props: {
  comparison: ActiveComparison;
  panes: PaneState[];
  streamingPaneIds: ReadonlySet<string>;
  agentTurns: Record<string, AgentTurn>;
  permissions: PermissionRequest[];
  onRespondPermission(permissionId: string, optionId: string | null): void;
  onKeep(providerId: string): Promise<void>;
  onDiscard(): Promise<void>;
  onClose(): void;
}) {
  const { comparison } = props;
  const [selected, setSelected] = useState(comparison.runs[0]?.providerId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    action()
      .catch((caught: unknown) => setError(describeSendError(caught)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-background p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="eyebrow text-muted-foreground">
            Comparing {comparison.runs.length} assistants · from{" "}
            <span className="font-mono">{comparison.base.slice(0, 7)}</span>
          </p>
          <p className="line-clamp-2 text-[13px]">{comparison.prompt}</p>
        </div>
        {comparison.outcome === null && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(props.onDiscard)}>
            <Trash2 />
            Discard all
          </Button>
        )}
      </div>
      {comparison.outcome !== null && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/[0.07] px-3 py-2 text-xs"
        >
          <p className="min-w-0 flex-1">{comparison.outcome}</p>
          <Button size="xs" onClick={props.onClose}>
            Back to the conversation
          </Button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-destructive/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}
      <div role="tablist" aria-label="Assistants" className="flex gap-1 lg:hidden">
        {comparison.runs.map((run) => (
          <button
            key={run.providerId}
            type="button"
            role="tab"
            aria-selected={selected === run.providerId}
            onClick={() => setSelected(run.providerId)}
            className={cn(
              "cursor-pointer rounded-full border px-2.5 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected === run.providerId
                ? "border-primary/60 bg-primary/[0.06] text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {providerMeta(run.providerId).label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        {comparison.runs.map((run) => {
          const paneId = comparison.paneIds[run.providerId] ?? "";
          return (
            <RunColumn
              key={run.providerId}
              comparison={comparison}
              providerId={run.providerId}
              pane={props.panes.find((pane) => pane.id === paneId)}
              streaming={props.streamingPaneIds.has(paneId)}
              turn={props.agentTurns[paneId]}
              permissions={props.permissions.filter((request) => request.paneId === paneId)}
              hidden={selected !== run.providerId}
              busy={busy}
              onRespondPermission={props.onRespondPermission}
              onKeep={() => act(() => props.onKeep(run.providerId))}
            />
          );
        })}
      </div>
    </div>
  );
}
