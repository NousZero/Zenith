import { CalendarClock, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { BOT_PLATFORMS, type BotStatus } from "../shared/bots";
import { nextRun, SCHEDULE_PRESETS } from "../shared/schedule";
import type { ConnectionStatus, Model, ScheduledTask } from "../shared/types";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./lib/utils";
import { DEFAULT_CLI_MODEL_ID, providerMeta, usesDefaultModel } from "./providers";

const SELECT_CLASS =
  "h-8 min-w-0 cursor-pointer rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Draft = Omit<ScheduledTask, "id" | "nextRunAt" | "lastRunAt" | "lastResult" | "lastError"> & {
  id?: string;
};

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

function when(timestamp: number | null): string {
  return timestamp === null
    ? "—"
    : new Date(timestamp).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function schedulePreview(expression: string): string {
  try {
    return `Next run: ${when(nextRun(expression, Date.now()))}`;
  } catch (error) {
    return errorText(error);
  }
}

function TaskForm(props: {
  draft: Draft;
  connections: ConnectionStatus[];
  bots: BotStatus[];
  onCancel(): void;
  onSaved(tasks: ScheduledTask[]): void;
}) {
  const [draft, setDraft] = useState(props.draft);
  const [models, setModels] = useState<{ providerId: string; items: Model[] }>({
    providerId: "",
    items: [],
  });
  const [error, setError] = useState("");
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const provider = props.connections.find((connection) => connection.id === draft.providerId);
  const needsModel = provider !== undefined && !usesDefaultModel(provider.kind);

  useEffect(() => {
    if (!needsModel) return;
    let cancelled = false;
    window.zenith.providers
      .listModels(draft.providerId)
      .then((items) => {
        if (!cancelled) setModels({ providerId: draft.providerId, items });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needsModel, draft.providerId]);

  const targets = props.bots.flatMap((bot) =>
    bot.users.map((user) => ({
      value: `${bot.platform}:${user.userId}`,
      label: `${BOT_PLATFORMS.find((platform) => platform.id === bot.platform)?.label ?? bot.platform} · ${user.name}`,
    })),
  );

  async function save() {
    try {
      props.onSaved(
        await window.zenith.schedule.save({
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          prompt: draft.prompt,
          schedule: draft.schedule,
          providerId: draft.providerId,
          modelId: draft.modelId,
          deliverTo: draft.deliverTo,
          enabled: draft.enabled,
        }),
      );
    } catch (caught: unknown) {
      setError(errorText(caught));
    }
  }

  return (
    <form
      className="flex flex-col gap-2.5 rounded-lg border border-border p-3"
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
          placeholder="Morning briefing"
          className="h-8 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Prompt
        <Textarea
          rows={3}
          value={draft.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
          placeholder="Summarize three things worth knowing about TypeScript releases this week."
          className="resize-y text-xs"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        When
        <select
          aria-label="Schedule preset"
          value={
            SCHEDULE_PRESETS.some((preset) => preset.expression === draft.schedule)
              ? draft.schedule
              : ""
          }
          onChange={(event) => event.target.value && update({ schedule: event.target.value })}
          className={SELECT_CLASS}
        >
          <option value="">Custom</option>
          {SCHEDULE_PRESETS.map((preset) => (
            <option key={preset.expression} value={preset.expression}>
              {preset.label}
            </option>
          ))}
        </select>
        <Input
          aria-label="Cron schedule"
          value={draft.schedule}
          onChange={(event) => update({ schedule: event.target.value })}
          className="h-8 w-36 font-mono text-xs"
        />
        <span className="text-[11px]">{schedulePreview(draft.schedule)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Answer with
        <select
          aria-label="Connection"
          value={draft.providerId}
          onChange={(event) => {
            const next = props.connections.find(
              (connection) => connection.id === event.target.value,
            );
            update({
              providerId: event.target.value,
              modelId: next && usesDefaultModel(next.kind) ? DEFAULT_CLI_MODEL_ID : "",
            });
          }}
          className={SELECT_CLASS}
        >
          <option value="">Choose a connection…</option>
          {props.connections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {providerMeta(connection.id).label}
            </option>
          ))}
        </select>
        {needsModel && (
          <select
            aria-label="Model"
            value={draft.modelId}
            onChange={(event) => update({ modelId: event.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">Choose a model…</option>
            {(models.providerId === draft.providerId ? models.items : []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <fieldset className="flex flex-col gap-1 text-xs text-muted-foreground">
        <legend className="mb-1">Also send to</legend>
        {targets.length === 0 ? (
          <span className="text-[11px]">Pair someone in Bots to send results to a chat app.</span>
        ) : (
          targets.map((target) => (
            <label
              key={target.value}
              className="flex cursor-pointer items-center gap-2 text-foreground"
            >
              <input
                type="checkbox"
                checked={draft.deliverTo.includes(target.value)}
                onChange={(event) =>
                  update({
                    deliverTo: event.target.checked
                      ? [...draft.deliverTo, target.value]
                      : draft.deliverTo.filter((value) => value !== target.value),
                  })
                }
              />
              {target.label}
            </label>
          ))
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}

export function ScheduleDialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  connections: ConnectionStatus[];
}) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [bots, setBots] = useState<BotStatus[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([window.zenith.schedule.list(), window.zenith.bots.list()])
      .then(([nextTasks, nextBots]) => {
        if (cancelled) return;
        setTasks(nextTasks);
        setBots(nextBots);
      })
      .catch((caught: unknown) => console.error("Failed to load scheduled tasks:", caught));
    const unsubscribe = window.zenith.schedule.onChanged(setTasks);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [props.open]);

  const chatConnections = props.connections.filter(
    (connection) => connection.state === "ready" && connection.kind !== "agent",
  );

  async function runNow(task: ScheduledTask) {
    setRunning((current) => new Set(current).add(task.id));
    try {
      const updated = await window.zenith.schedule.runNow(task.id);
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught: unknown) {
      setError(errorText(caught));
    } finally {
      setRunning((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  function saveToggle(task: ScheduledTask, enabled: boolean) {
    void window.zenith.schedule
      .save({ ...task, enabled })
      .then(setTasks)
      .catch((caught: unknown) => setError(errorText(caught)));
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(760px,calc(100vw-48px))]">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle>Scheduled tasks</DialogTitle>
          <DialogDescription>
            Prompts that run on a schedule while Zenith is open. They run as plain chats without
            tools, since nobody is there to approve them. A run missed while Zenith was closed
            happens once when it opens.
          </DialogDescription>
        </div>

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        {draft ? (
          <TaskForm
            key={draft.id ?? "new"}
            draft={draft}
            connections={chatConnections}
            bots={bots}
            onCancel={() => setDraft(null)}
            onSaved={(next) => {
              setTasks(next);
              setDraft(null);
            }}
          />
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() =>
              setDraft({
                name: "",
                prompt: "",
                schedule: "0 9 * * *",
                providerId: chatConnections[0]?.id ?? "",
                modelId:
                  chatConnections[0] && usesDefaultModel(chatConnections[0].kind)
                    ? DEFAULT_CLI_MODEL_ID
                    : "",
                deliverTo: [],
                enabled: true,
              })
            }
          >
            <Plus />
            New scheduled task
          </Button>
        )}

        <ul className="flex flex-col gap-2">
          {tasks.length === 0 && !draft && (
            <li className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
              <CalendarClock className="size-6" aria-hidden />
              No scheduled tasks yet.
            </li>
          )}
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-1.5 rounded-lg border border-border p-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{task.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{task.schedule}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Switch
                    aria-label={`${task.enabled ? "Pause" : "Resume"} ${task.name}`}
                    checked={task.enabled}
                    onCheckedChange={(enabled) => saveToggle(task, enabled)}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Run ${task.name} now`}
                    disabled={running.has(task.id)}
                    onClick={() => void runNow(task)}
                  >
                    <Play />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${task.name}`}
                    onClick={() => setDraft({ ...task })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${task.name}`}
                    onClick={() => void window.zenith.schedule.remove(task.id).then(setTasks)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <span className="text-muted-foreground">
                {providerMeta(task.providerId).label}
                {task.modelId && task.modelId !== DEFAULT_CLI_MODEL_ID
                  ? ` · ${task.modelId}`
                  : ""}{" "}
                · next {task.enabled ? when(task.nextRunAt) : "paused"} · last{" "}
                {when(task.lastRunAt)}
                {running.has(task.id) ? " · running…" : ""}
              </span>
              {task.lastError && <span className="text-danger">{task.lastError}</span>}
              {task.lastResult && (
                <p
                  className={cn(
                    "line-clamp-4 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-foreground",
                  )}
                >
                  {task.lastResult}
                </p>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
