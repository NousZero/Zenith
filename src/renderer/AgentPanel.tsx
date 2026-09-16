import {
  Ban,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  History,
  Loader2,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import type { AgentActivity } from "../shared/types";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";
import type { AgentTurn } from "./useHarness";

export function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background/80 py-1.5 font-mono text-[11px] leading-relaxed">
      {diff.split("\n").map((line, index) => (
        <div
          key={index}
          className={cn(
            "whitespace-pre px-2.5",
            line.startsWith("+") && !line.startsWith("+++") && "bg-success/15 text-success",
            line.startsWith("-") && !line.startsWith("---") && "bg-destructive/15 text-danger",
            (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")) &&
              "text-muted-foreground",
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

const STATUS: Record<
  AgentActivity["status"],
  { icon: typeof Circle; className: string; label: string }
> = {
  running: { icon: Loader2, className: "text-primary motion-safe:animate-spin", label: "Running" },
  "awaiting-approval": { icon: Clock, className: "text-warning", label: "Waiting for approval" },
  done: { icon: CheckCircle2, className: "text-success", label: "Done" },
  failed: { icon: XCircle, className: "text-danger", label: "Failed" },
  denied: { icon: Ban, className: "text-muted-foreground", label: "Denied" },
};

// Live task view: the agent's todo list and every tool call during the latest reply.
export function AgentPanel(props: {
  turn: AgentTurn;
  streaming: boolean;
  onRollback(): Promise<void>;
}) {
  const { turn } = props;
  const [confirming, setConfirming] = useState(false);
  const changedFiles = turn.activities.filter((activity) => activity.checkpoint).length;
  // With a snapshot, any action may have changed files (commands included).
  const canUndo = changedFiles > 0 || (turn.snapshot && turn.activities.length > 0);
  if (turn.activities.length === 0 && turn.todos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
      {turn.todos.length > 0 && (
        <ul aria-label="Agent tasks" className="flex flex-col gap-1">
          {turn.todos.map((todo, index) => {
            const Icon =
              todo.status === "completed"
                ? CheckCircle2
                : todo.status === "in_progress"
                  ? CircleDot
                  : Circle;
            return (
              <li key={index} className="flex items-start gap-2">
                <Icon
                  aria-label={todo.status.replace("_", " ")}
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    todo.status === "completed" && "text-success",
                    todo.status === "in_progress" && "text-primary",
                    todo.status === "pending" && "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "leading-relaxed",
                    todo.status === "completed" && "text-muted-foreground line-through",
                  )}
                >
                  {todo.content}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {turn.activities.length > 0 && (
        <details open={props.streaming} className="group/activity">
          <summary className="cursor-pointer select-none text-muted-foreground">
            {turn.activities.length} {turn.activities.length === 1 ? "action" : "actions"}
            {changedFiles > 0 &&
              ` · ${changedFiles} file ${changedFiles === 1 ? "change" : "changes"}`}
          </summary>
          <ol aria-label="Agent actions" className="mt-1.5 flex flex-col gap-1">
            {turn.activities.map((activity) => {
              const status = STATUS[activity.status];
              return (
                <li key={activity.id} className="flex items-start gap-2">
                  <status.icon
                    aria-label={status.label}
                    className={cn("mt-0.5 size-3.5 shrink-0", status.className)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-[11px] text-foreground">
                      {activity.title}
                    </span>
                    {activity.detail && activity.status !== "done" && (
                      <span className="line-clamp-2 text-muted-foreground">{activity.detail}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      )}

      {canUndo && !props.streaming && (
        <div className="flex items-center gap-2 border-t border-border pt-2">
          {turn.rolledBack ? (
            <span className="text-muted-foreground">
              Restored {turn.rolledBack.length} {turn.rolledBack.length === 1 ? "file" : "files"} to
              how {turn.rolledBack.length === 1 ? "it was" : "they were"} before this reply.
            </span>
          ) : (
            <>
              <span className="flex-1 text-muted-foreground">
                {confirming
                  ? turn.snapshot
                    ? "Put the whole project back as it was before this reply? Anything changed since then, including your own edits, is lost."
                    : "Put the changed files back as they were? Later edits to them are lost."
                  : turn.snapshot
                    ? "Everything this reply changed, including by commands, can be undone."
                    : "Files changed by this reply can be restored."}
              </span>
              {confirming && (
                <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              )}
              <Button
                size="xs"
                variant={confirming ? "destructive" : "outline"}
                onClick={() => {
                  if (!confirming) return setConfirming(true);
                  setConfirming(false);
                  void props.onRollback();
                }}
              >
                <History />
                {confirming ? "Restore files" : "Undo file changes"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
