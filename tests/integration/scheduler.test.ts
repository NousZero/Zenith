import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../src/main/database";
import { createScheduler } from "../../src/main/scheduler";
import type { ScheduledTask } from "../../src/shared/types";

describe("scheduler", () => {
  let dir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-schedule-"));
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  function setup(options: { fail?: boolean; failDelivery?: boolean } = {}) {
    let clock = new Date("2026-09-14T08:59:00").getTime();
    const runs: string[] = [];
    const delivered: { target: string; text: string }[] = [];
    const announced: ScheduledTask[] = [];
    const scheduler = createScheduler({
      db,
      now: () => clock,
      run: async (task) => {
        runs.push(task.prompt);
        if (options.fail) throw new Error("model offline");
        return "Sunny, 21°C";
      },
      deliver: async (target, text) => {
        if (options.failDelivery) throw new Error("bot is off");
        delivered.push({ target, text });
      },
      announce: (task) => announced.push(task),
    });
    return { scheduler, runs, delivered, announced, advance: (ms: number) => (clock += ms) };
  }

  const input = {
    name: "Weather",
    prompt: "Weather today?",
    schedule: "0 9 * * *",
    providerId: "ollama",
    modelId: "llama3",
    deliverTo: ["telegram:42", "not a target"],
    enabled: true,
  };

  it("runs due tasks, delivers results, and schedules the next run", async () => {
    const { scheduler, runs, delivered, announced, advance } = setup();
    const [task] = scheduler.save(input);
    expect(task).toMatchObject({ deliverTo: ["telegram:42"], lastRunAt: null });
    expect(new Date(task?.nextRunAt ?? 0).toString()).toContain("09:00:00");

    await scheduler.tick();
    expect(runs).toEqual([]);

    advance(60_000);
    await scheduler.tick();
    expect(runs).toEqual(["Weather today?"]);
    expect(delivered).toEqual([{ target: "telegram:42", text: "Weather\n\nSunny, 21°C" }]);
    const updated = announced.at(-1);
    expect(updated).toMatchObject({ lastResult: "Sunny, 21°C", lastError: null });
    expect(new Date(updated?.nextRunAt ?? 0).getDate()).toBe(15);

    await scheduler.tick();
    expect(runs).toHaveLength(1);
  });

  it("records run and delivery failures without stopping the schedule", async () => {
    const failing = setup({ fail: true });
    const [task] = failing.scheduler.save(input);
    const result = await failing.scheduler.runNow(task?.id ?? "");
    expect(result).toMatchObject({ lastResult: null, lastError: "model offline" });
    expect(result.nextRunAt).not.toBeNull();

    failing.scheduler.remove(task?.id ?? "");
    const undelivered = setup({ failDelivery: true });
    const [second] = undelivered.scheduler.save(input);
    const delivered = await undelivered.scheduler.runNow(second?.id ?? "");
    expect(delivered.lastResult).toBe("Sunny, 21°C");
    expect(delivered.lastError).toBe("Delivered in Zenith, but not to telegram:42: bot is off");
  });

  it("validates input and leaves disabled tasks unscheduled", () => {
    const { scheduler } = setup();
    expect(() => scheduler.save({ ...input, schedule: "every day" })).toThrow("five fields");
    expect(() => scheduler.save({ ...input, name: " " })).toThrow("name and a prompt");
    const [task] = scheduler.save({ ...input, enabled: false });
    expect(task?.nextRunAt).toBeNull();
  });
});
