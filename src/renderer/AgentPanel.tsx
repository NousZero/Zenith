import {
  Check,
  CheckCircle2,
  ChevronUp,
  Circle,
  CircleDot,
  FileDiff,
  History,
  ListChecks,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { gateFixPrompt } from "../shared/gates";
import type { AgentActivity, AgentTodo, GateResult, ReviewResult } from "../shared/types";
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

const STATUS: Record<AgentActivity["status"], { className: string; label: string }> = {
  running: { className: "bg-primary motion-safe:animate-pulse", label: "Running" },
  "awaiting-approval": { className: "bg-warning", label: "Waiting for approval" },
  done: { className: "bg-success", label: "Done" },
  failed: { className: "bg-danger", label: "Failed" },
  denied: { className: "bg-muted-foreground", label: "Denied" },
};

// A tool call reads like a terminal line: a status bullet, the verb, then what it acted on.
// Commands get their own "$" line, and every result sits under "⎿", the way the CLIs print it.
function ActivityRow({ activity }: { activity: AgentActivity }) {
  const status = STATUS[activity.status];
  const run = /^Run (in sandbox: |outside sandbox: )?/.exec(activity.title);
  const command = run ? activity.title.slice(run[0].length) : "";
  const verb = run ? "Run" : (activity.title.split(" ")[0] ?? activity.title);
  const target = run
    ? (run[1] ?? "").replace(":", "").trim()
    : activity.title.split(" ").slice(1).join(" ");

  return (
    <li className="activity-row flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed">
      <span className="flex items-baseline gap-2">
        <span
          aria-label={status.label}
          className={cn("size-1.5 shrink-0 translate-y-[-1px] rounded-full", status.className)}
        />
        <span className="min-w-0 truncate">
          <span className="font-semibold text-foreground">{verb}</span>
          {target && <span className="text-muted-foreground"> {target}</span>}
        </span>
      </span>
      {command && (
        <span className="flex gap-1.5 pl-3.5 text-muted-foreground">
          <span aria-hidden>└</span>
          <span className="min-w-0 truncate">
            <span className="text-primary">$</span> {command}
          </span>
        </span>
      )}
      {activity.detail && activity.status !== "done" && (
        <span
          className={cn(
            "flex gap-1.5 pl-3.5",
            activity.status === "failed" || activity.status === "denied"
              ? "text-danger"
              : "text-muted-foreground",
          )}
        >
          <span aria-hidden>⎿</span>
          <span className="line-clamp-2 min-w-0">{activity.detail}</span>
        </span>
      )}
    </li>
  );
}

const GATE_STATE: Record<GateResult["state"], string> = {
  pass: "border-success/40 text-success",
  fail: "border-danger/50 text-danger",
  skipped: "border-border text-muted-foreground",
};

// What the project looks like after a reply that could change files: leaked secrets, errors the
// language server reports, and how far the change spread. Findings go back to the agent in one
// click rather than being copied by hand.
function GateStrip(props: {
  projectPath: string;
  onFix(prompt: string): void;
  // The connection asked to review the changes: another one where possible, so the reviewer is
  // not the model that wrote them.
  reviewer?: { providerId: string; modelId: string; label: string } | undefined;
}) {
  const [gates, setGates] = useState<GateResult[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const { projectPath, reviewer } = props;

  function runReview() {
    if (!reviewer) return;
    setReviewing(true);
    setOpen("review");
    window.zenith.gates
      .review({ projectPath, providerId: reviewer.providerId, modelId: reviewer.modelId })
      .then(setReview)
      .catch((error: unknown) =>
        setReview({
          verdict: "unclear",
          reviewer: reviewer.label,
          text: error instanceof Error ? error.message : String(error),
        }),
      )
      .finally(() => setReviewing(false));
  }

  useEffect(() => {
    let cancelled = false;
    window.zenith.gates
      .run(projectPath)
      .then((results) => {
        if (!cancelled) setGates(results);
      })
      .catch((error: unknown) => console.error("Failed to run the checks:", error));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  if (gates === null) {
    return (
      <p role="status" className="eyebrow text-muted-foreground">
        Checking what changed…
      </p>
    );
  }

  const failed = gates.filter((gate) => gate.state === "fail");
  const shown = gates.find((gate) => gate.id === open);

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {gates.map((gate) => (
          <button
            key={gate.id}
            type="button"
            aria-pressed={open === gate.id}
            title={gate.detail}
            onClick={() => setOpen(open === gate.id ? null : gate.id)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              GATE_STATE[gate.state],
              open === gate.id && "bg-accent",
            )}
          >
            {gate.state === "pass" ? "✓" : gate.state === "fail" ? "✗" : "–"} {gate.label}
          </button>
        ))}
        {review && (
          <button
            type="button"
            aria-pressed={open === "review"}
            title={`Reviewed by ${review.reviewer}`}
            onClick={() => setOpen(open === "review" ? null : "review")}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              review.verdict === "clean"
                ? GATE_STATE.pass
                : review.verdict === "findings"
                  ? GATE_STATE.fail
                  : GATE_STATE.skipped,
              open === "review" && "bg-accent",
            )}
          >
            {review.verdict === "clean" ? "✓" : review.verdict === "findings" ? "✗" : "–"} Review
          </button>
        )}
        {reviewer && !review && (
          <Button size="xs" variant="ghost" disabled={reviewing} onClick={runReview}>
            <ShieldCheck />
            {reviewing ? `${reviewer.label} is reading…` : `Review with ${reviewer.label}`}
          </Button>
        )}
        {failed.length > 0 && (
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            onClick={() => props.onFix(gateFixPrompt(gates))}
          >
            <Wand2 />
            Ask the agent to fix
          </Button>
        )}
      </div>
      {open === "review" && (review || reviewing) && (
        <div className="flex flex-col gap-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
          <span className="text-muted-foreground">
            {reviewing
              ? `${reviewer?.label ?? "The reviewer"} is reading the changes…`
              : `${review?.reviewer ?? ""} read the changes on its own, with no other context.`}
          </span>
          {review && (
            <span className={review.verdict === "findings" ? "text-danger" : "text-foreground/90"}>
              {review.text}
            </span>
          )}
        </div>
      )}
      {shown && (
        <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed">
          <span className="text-muted-foreground">{shown.detail}</span>
          {shown.findings.map((finding) => (
            <span
              key={finding}
              className={cn(
                "whitespace-pre-wrap break-words",
                shown.state === "fail" ? "text-danger" : "text-muted-foreground",
              )}
            >
              {finding}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Live task view: the agent's todo list and every tool call during the latest reply.
export function AgentPanel(props: {
  turn: AgentTurn;
  streaming: boolean;
  onRollback(): Promise<void>;
  // Set when the reply ran in a project folder, so its changes can be checked.
  projectPath?: string | null;
  onFixGates?(prompt: string): void;
  reviewer?: { providerId: string; modelId: string; label: string } | undefined;
}) {
  const { turn } = props;
  const changedFiles = turn.activities.filter((activity) => activity.checkpoint).length;
  if (turn.activities.length === 0 && turn.todos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-l-2 border-border bg-muted/20 py-2 pl-3 pr-2.5 text-xs">
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
          <summary className="eyebrow cursor-pointer select-none text-muted-foreground">
            {turn.activities.length} {turn.activities.length === 1 ? "action" : "actions"}
            {changedFiles > 0 &&
              ` · ${changedFiles} file ${changedFiles === 1 ? "change" : "changes"}`}
          </summary>
          <ol aria-label="Agent actions" className="mt-1.5 flex flex-col gap-1.5">
            {turn.activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </ol>
        </details>
      )}

      {!props.streaming && props.projectPath && props.onFixGates && turn.activities.length > 0 && (
        <GateStrip
          key={turn.turnId}
          projectPath={props.projectPath}
          onFix={props.onFixGates}
          reviewer={props.reviewer}
        />
      )}

      {turn.rolledBack && (
        <p className="border-t border-border pt-2 text-muted-foreground">
          Restored {turn.rolledBack.length} {turn.rolledBack.length === 1 ? "file" : "files"} to how{" "}
          {turn.rolledBack.length === 1 ? "it was" : "they were"} before this reply.
        </p>
      )}
    </div>
  );
}

// What a finished reply changed, pinned above the composer until kept or undone, as in Cursor's
// review bar. Undo is all-or-nothing: checkpoints restore per reply, not per hunk.
export function ReviewBar(props: {
  turn: AgentTurn;
  onRollback(): Promise<void>;
  onKeep(): void;
  onShowDiff(): void;
}) {
  const { turn } = props;
  const [confirming, setConfirming] = useState(false);
  const files = turn.activities
    .filter((activity) => activity.checkpoint)
    .map((activity) => activity.title.replace(/^\S+\s+/, ""));
  const names = [...new Set(files)];
  // With a snapshot, any action may have changed files (commands included).
  if (names.length === 0 && !(turn.snapshot && turn.activities.length > 0)) return null;
  const summary =
    names.length > 0
      ? `${names.length} ${names.length === 1 ? "file" : "files"} changed`
      : "The project may have changed";

  return (
    <div
      role="region"
      aria-label="Review changes"
      className="flex items-center gap-2 border-t border-primary/25 bg-primary/[0.05] px-4 py-2 text-xs"
    >
      <FileDiff className="size-3.5 shrink-0 text-primary" aria-hidden />
      {confirming ? (
        <span className="min-w-0 flex-1 text-muted-foreground">
          {turn.snapshot
            ? "Put the whole project back as it was before this reply? Anything changed since, including your own edits, is lost."
            : "Put the changed files back as they were? Later edits to them are lost."}
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 font-medium">{summary}</span>
          <span className="flex min-w-0 gap-1 overflow-hidden">
            {names.slice(0, 4).map((name) => (
              <span
                key={name}
                title={name}
                className="max-w-40 truncate border border-border bg-background/60 px-1.5 py-px font-mono text-[10px] text-muted-foreground"
              >
                {name.split(/[\\/]/).at(-1)}
              </span>
            ))}
            {names.length > 4 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                +{names.length - 4}
              </span>
            )}
          </span>
        </span>
      )}
      {confirming ? (
        <>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            size="xs"
            variant="destructive"
            onClick={() => {
              setConfirming(false);
              void props.onRollback();
            }}
          >
            <History />
            Restore files
          </Button>
        </>
      ) : (
        <>
          <Button size="xs" variant="ghost" onClick={props.onShowDiff}>
            See diff
          </Button>
          <Button size="xs" variant="outline" onClick={() => setConfirming(true)}>
            <History />
            Undo all
          </Button>
          <Button size="xs" onClick={props.onKeep}>
            <Check />
            Keep
          </Button>
        </>
      )}
    </div>
  );
}

// The agent's to-do list while a reply runs, pinned above the composer as Cursor does: how far
// along it is and the step in progress, opening to the whole list.
export function TodoStrip({ todos }: { todos: readonly AgentTodo[] }) {
  const [open, setOpen] = useState(false);
  const done = todos.filter((todo) => todo.status === "completed").length;
  const current =
    todos.find((todo) => todo.status === "in_progress") ??
    todos.find((todo) => todo.status === "pending");
  return (
    <div className="border-t border-border bg-card/60 px-4 py-1.5 text-xs">
      {open && (
        <ul aria-label="Plan" className="mb-1.5 flex flex-col gap-1 pt-1">
          {todos.map((todo, index) => {
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
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ListChecks className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="shrink-0 font-mono text-[10px] tracking-[0.09em] text-muted-foreground">
          {done}/{todos.length}
        </span>
        <span aria-hidden className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${(done / todos.length) * 100}%` }}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">
          {current ? current.content : "All steps done"}
        </span>
        <ChevronUp
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            !open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}
