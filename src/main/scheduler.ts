import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { nextRun } from "../shared/schedule";
import type { ScheduledTask } from "../shared/types";

const TICK_MS = 30_000;
const MAX_RESULT_CHARS = 20_000;

interface Row {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  provider_id: string;
  model_id: string;
  deliver_to: string;
  enabled: number;
  next_run_at: number | null;
  last_run_at: number | null;
  last_result: string | null;
  last_error: string | null;
}

function toTask(row: Row): ScheduledTask {
  let deliverTo: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.deliver_to);
    if (Array.isArray(parsed))
      deliverTo = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    deliverTo = [];
  }
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    schedule: row.schedule,
    providerId: row.provider_id,
    modelId: row.model_id,
    deliverTo,
    enabled: row.enabled === 1,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastResult: row.last_result,
    lastError: row.last_error,
  };
}

export interface SchedulerDeps {
  db: DatabaseSync;
  // Runs the prompt as a plain chat (no tools: nobody is there to approve them).
  run(task: ScheduledTask): Promise<string>;
  // Sends the result to one "platform:userId" target.
  deliver(target: string, text: string): Promise<void>;
  // Shows the result on the desktop and tells open windows the list changed.
  announce(task: ScheduledTask): void;
  now?: () => number;
}

export function createScheduler(deps: SchedulerDeps) {
  const now = deps.now ?? Date.now;
  const { db } = deps;
  const statements = {
    all: db.prepare("SELECT * FROM scheduled_tasks ORDER BY created_at"),
    get: db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?"),
    due: db.prepare(
      "SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?",
    ),
    upsert: db.prepare(
      `INSERT INTO scheduled_tasks (id, name, prompt, schedule, provider_id, model_id, deliver_to,
                                    enabled, next_run_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, prompt = excluded.prompt, schedule = excluded.schedule,
         provider_id = excluded.provider_id, model_id = excluded.model_id,
         deliver_to = excluded.deliver_to, enabled = excluded.enabled, next_run_at = excluded.next_run_at`,
    ),
    finish: db.prepare(
      `UPDATE scheduled_tasks SET last_run_at = ?, last_result = ?, last_error = ?, next_run_at = ?
       WHERE id = ?`,
    ),
    remove: db.prepare("DELETE FROM scheduled_tasks WHERE id = ?"),
  };
  const running = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const list = () => (statements.all.all() as unknown as Row[]).map(toTask);

  async function execute(task: ScheduledTask): Promise<ScheduledTask> {
    if (running.has(task.id)) return task;
    running.add(task.id);
    const startedAt = now();
    let result: string | null = null;
    let error: string | null = null;
    try {
      result = (await deps.run(task)).trim().slice(0, MAX_RESULT_CHARS) || "(Empty reply.)";
      const failures: string[] = [];
      for (const target of task.deliverTo) {
        await deps.deliver(target, `${task.name}\n\n${result}`).catch((deliveryError: unknown) => {
          failures.push(
            `${target}: ${deliveryError instanceof Error ? deliveryError.message : String(deliveryError)}`,
          );
        });
      }
      if (failures.length > 0) error = `Delivered in Zenith, but not to ${failures.join("; ")}`;
    } catch (runError) {
      error = runError instanceof Error ? runError.message : String(runError);
    } finally {
      running.delete(task.id);
    }
    // A missed run while Zenith was closed runs once; the next run is counted from now.
    const next = task.enabled ? nextRun(task.schedule, Math.max(now(), startedAt)) : null;
    statements.finish.run(startedAt, result, error, next, task.id);
    const updated = toTask(statements.get.get(task.id) as unknown as Row);
    deps.announce(updated);
    return updated;
  }

  async function tick() {
    for (const row of statements.due.all(now()) as unknown as Row[]) {
      await execute(toTask(row));
    }
  }

  return {
    list,

    save(input: {
      id?: string;
      name: string;
      prompt: string;
      schedule: string;
      providerId: string;
      modelId: string;
      deliverTo: string[];
      enabled: boolean;
    }): ScheduledTask[] {
      const name = input.name.trim();
      const prompt = input.prompt.trim();
      if (!name || !prompt) throw new Error("A scheduled task needs a name and a prompt.");
      if (!input.providerId || !input.modelId) throw new Error("Choose a connection and model.");
      // Throws a readable message for invalid schedules.
      const next = nextRun(input.schedule, now());
      statements.upsert.run(
        input.id ?? randomUUID(),
        name,
        prompt,
        input.schedule.trim(),
        input.providerId,
        input.modelId,
        JSON.stringify(input.deliverTo.filter((target) => /^[a-z]+:.+$/.test(target))),
        input.enabled ? 1 : 0,
        input.enabled ? next : null,
        now(),
      );
      return list();
    },

    remove(id: string): ScheduledTask[] {
      statements.remove.run(id);
      return list();
    },

    async runNow(id: string): Promise<ScheduledTask> {
      const row = statements.get.get(id) as unknown as Row | undefined;
      if (!row) throw new Error("That scheduled task no longer exists.");
      return execute(toTask(row));
    },

    tick,

    start() {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), TICK_MS);
      timer.unref?.();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
