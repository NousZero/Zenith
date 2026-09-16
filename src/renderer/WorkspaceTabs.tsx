import { GitBranch, GitCommitHorizontal, Play, RefreshCw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { GitStatus, GitWorktree } from "../shared/types";
import { DiffView } from "./AgentPanel";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { cn } from "./lib/utils";

const MAX_TERMINAL_CHARS = 200_000;
const STATE_LETTERS: Record<GitStatus["files"][number]["state"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "U",
};

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function ChangesTab(props: {
  projectPath: string;
  refreshKey: number;
  onOpenWorktree(path: string): void;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([]);
  const [selected, setSelected] = useState<{ path: string; diff: string } | null>(null);
  const [message, setMessage] = useState("");
  const [branch, setBranch] = useState("");
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.zenith.workspace.gitStatus(props.projectPath),
      window.zenith.workspace.worktrees(props.projectPath),
    ])
      .then(([nextStatus, nextWorktrees]) => {
        if (cancelled) return;
        setStatus(nextStatus);
        setWorktrees(nextWorktrees);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setNotice({ kind: "error", text: errorText(caught) });
      });
    return () => {
      cancelled = true;
    };
  }, [props.projectPath, props.refreshKey, version]);

  const refresh = () => setVersion((value) => value + 1);

  async function showDiff(path: string, state: string) {
    try {
      setSelected({
        path,
        diff: await window.zenith.workspace.gitDiff(props.projectPath, path, state),
      });
    } catch (caught: unknown) {
      setNotice({ kind: "error", text: errorText(caught) });
    }
  }

  async function commit() {
    setConfirmCommit(false);
    try {
      const hash = await window.zenith.workspace.gitCommit(props.projectPath, message);
      setMessage("");
      setSelected(null);
      setNotice({ kind: "info", text: `Committed ${hash}.` });
      refresh();
    } catch (caught: unknown) {
      setNotice({ kind: "error", text: errorText(caught) });
    }
  }

  async function addWorktree() {
    try {
      const path = await window.zenith.workspace.addWorktree(props.projectPath, branch.trim());
      setBranch("");
      setNotice({ kind: "info", text: `Created worktree at ${path}.` });
      refresh();
    } catch (caught: unknown) {
      setNotice({ kind: "error", text: errorText(caught) });
    }
  }

  if (!status) return <p className="p-3 text-xs text-muted-foreground">Reading Git status…</p>;
  if (!status.isRepository) {
    return (
      <p className="p-3 text-xs leading-relaxed text-muted-foreground">
        This folder is not a Git repository. Run <code className="font-mono">git init</code> in the
        Terminal tab to track changes. Undo for agent replies works either way.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <GitBranch className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="truncate font-mono">{status.branch}</span>
        <span className="text-muted-foreground">
          · {status.files.length} {status.files.length === 1 ? "change" : "changes"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh Git status"
          className="ml-auto"
          onClick={refresh}
        >
          <RefreshCw />
        </Button>
      </div>
      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn(
            "px-3 py-1.5 text-xs",
            notice.kind === "error" ? "text-danger" : "text-muted-foreground",
          )}
        >
          {notice.text}
        </p>
      )}
      <ul aria-label="Changed files" className="max-h-[30%] overflow-y-auto p-1.5">
        {status.files.length === 0 && (
          <li className="px-2 py-1 text-xs text-muted-foreground">No uncommitted changes.</li>
        )}
        {status.files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => void showDiff(file.path, file.state)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-0.5 text-left text-xs hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected?.path === file.path && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "w-3 shrink-0 font-mono font-semibold",
                  file.state === "deleted"
                    ? "text-danger"
                    : file.state === "modified"
                      ? "text-warning"
                      : "text-success",
                )}
                title={file.state}
              >
                {STATE_LETTERS[file.state]}
              </span>
              <span className="truncate font-mono">{file.path}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="min-h-0 flex-1 overflow-auto border-t border-border p-2">
        {selected ? (
          selected.diff.trim() ? (
            <DiffView diff={selected.diff} />
          ) : (
            <p className="text-xs text-muted-foreground">No text changes.</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">Choose a file to see its diff.</p>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-border p-2">
        <div className="flex gap-2">
          <Input
            aria-label="Commit message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setConfirmCommit(false);
            }}
            placeholder="Commit message"
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant={confirmCommit ? "default" : "outline"}
            disabled={message.trim() === "" || status.files.length === 0}
            onClick={() => (confirmCommit ? void commit() : setConfirmCommit(true))}
          >
            <GitCommitHorizontal />
            {confirmCommit ? `Commit ${status.files.length}` : "Commit all"}
          </Button>
        </div>
        {confirmCommit && (
          <p className="text-[11px] text-muted-foreground">
            Stages every change listed above and commits it. The repository's own commit hooks run.
          </p>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground">
            Worktrees ({worktrees.length})
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {worktrees.map((worktree) => (
              <li key={worktree.path} className="flex items-center gap-2">
                <span className="truncate font-mono text-[11px]">{worktree.branch}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {worktree.path}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => props.onOpenWorktree(worktree.path)}
                >
                  Open in new pane
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Input
              aria-label="New worktree branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="new-branch-name"
              className="h-8 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={branch.trim() === ""}
              onClick={() => void addWorktree()}
            >
              Create worktree
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}

// Runs commands in the project with streamed output. The Tests tab uses it with a detected test
// command that runs only after a confirming second click.
export function TerminalTab(props: {
  projectPath: string;
  suggestedCommand?: string;
  confirmBeforeRun?: boolean;
  intro?: string;
  // The Tests tab shows results only: a fixed command with Run and Stop, and no typing.
  fixedCommand?: boolean;
}) {
  const [output, setOutput] = useState("");
  const [command, setCommand] = useState(props.suggestedCommand ?? "");
  const [confirming, setConfirming] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [recalled, setRecalled] = useState(0);
  const runningRef = useRef<string | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(
    () =>
      window.zenith.workspace.onCommandOutput((event) => {
        if (event.id !== runningRef.current) return;
        if (event.text !== undefined) {
          const text = event.text;
          setOutput((current) => (current + text).slice(-MAX_TERMINAL_CHARS));
        }
        if (event.exitCode !== undefined) {
          const code = event.exitCode;
          setOutput((current) => `${current}[exit code ${code ?? "unknown"}]\n`);
          runningRef.current = null;
          setRunningId(null);
        }
      }),
    [],
  );

  useEffect(() => {
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [output]);

  async function run() {
    const text = command.trim();
    if (!text || runningId) return;
    if (props.confirmBeforeRun && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    if (!props.suggestedCommand) setCommand("");
    setHistory((current) => [...current.filter((item) => item !== text), text].slice(-50));
    setOutput((current) => `${current}$ ${text}\n`);
    try {
      const id = await window.zenith.workspace.runCommand(props.projectPath, text);
      runningRef.current = id;
      setRunningId(id);
    } catch (caught: unknown) {
      setOutput((current) => `${current}${errorText(caught)}\n`);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <pre
        ref={outputRef}
        aria-label="Terminal output"
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-background/80 p-3 font-mono text-[11px] leading-relaxed"
      >
        {output ||
          `${props.intro ?? "Commands run in the project folder. Programs that wait for keyboard input won't work here."}\n`}
      </pre>
      <form
        className="flex gap-2 border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        {props.fixedCommand ? (
          <p className="min-w-0 flex-1 truncate py-1 font-mono text-xs text-muted-foreground">
            {command || "No test command found"}
          </p>
        ) : (
          <Input
            aria-label="Command"
            value={command}
            onChange={(event) => {
              setCommand(event.target.value);
              setConfirming(false);
            }}
            onKeyDown={(event) => {
              // Up and down walk back through earlier commands, as a shell does.
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              if (runningId || history.length === 0) return;
              event.preventDefault();
              const next = Math.min(
                history.length,
                Math.max(0, recalled + (event.key === "ArrowUp" ? 1 : -1)),
              );
              setRecalled(next);
              setCommand(next === 0 ? "" : (history[history.length - next] ?? ""));
            }}
            placeholder={runningId ? "Type a line for the running command…" : "npm test"}
            className="h-8 font-mono text-xs"
          />
        )}
        {runningId ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void window.zenith.workspace.stopCommand(runningId)}
          >
            <Square className="fill-current" />
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            size="sm"
            variant={props.confirmBeforeRun && !confirming ? "outline" : "default"}
            disabled={command.trim() === ""}
          >
            <Play />
            {confirming ? `Run in ${folderName(props.projectPath)}` : "Run"}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => setOutput("")}>
          Clear
        </Button>
      </form>
    </div>
  );
}

// The project's usual test command, from its manifest files.
async function detectTestCommand(projectPath: string): Promise<string> {
  const read = (path: string) =>
    window.zenith.workspace.read(projectPath, path).then(
      (file) => file.content,
      () => null,
    );
  const packageJson = await read("package.json");
  if (packageJson) {
    try {
      const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts;
      if (scripts?.["test"]) return "npm test";
    } catch {
      // Not valid JSON; try the other manifests.
    }
  }
  if (await read("Cargo.toml")) return "cargo test";
  if (await read("go.mod")) return "go test ./...";
  if ((await read("pyproject.toml")) || (await read("pytest.ini"))) return "python -m pytest";
  return "";
}

export function TestsTab(props: { projectPath: string }) {
  const [detected, setDetected] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void detectTestCommand(props.projectPath).then((command) => {
      if (!cancelled) setDetected(command);
    });
    return () => {
      cancelled = true;
    };
  }, [props.projectPath]);
  if (detected === null)
    return <p className="p-4 text-xs text-muted-foreground">Looking for tests…</p>;
  return (
    <TerminalTab
      projectPath={props.projectPath}
      suggestedCommand={detected}
      fixedCommand
      confirmBeforeRun
      intro={
        detected
          ? `Test results appear here. ${detected} runs in the project folder after a confirming second click.`
          : "No test command found in package.json, Cargo.toml, go.mod, or pyproject.toml."
      }
    />
  );
}
