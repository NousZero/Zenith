import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../src/main/database";
import { createGoalsStore } from "../../src/main/goals-store";

function store() {
  const db: DatabaseSync = openDatabase(":memory:");
  let clock = 1_000;
  return createGoalsStore(db, () => (clock += 1));
}

describe("createGoalsStore", () => {
  let goals: ReturnType<typeof createGoalsStore>;

  beforeEach(() => {
    goals = store();
  });

  it("keeps a goal and reads it back", () => {
    const created = goals.create({ title: "Ship the harness" });
    expect(created.title).toBe("Ship the harness");
    expect(created.status).toBe("active");
    expect(created.progress).toBe(0);
    expect(goals.list()).toHaveLength(1);
  });

  it("refuses a goal with no title", () => {
    expect(() => goals.create({ title: "   " })).toThrow(/needs a title/);
  });

  it("collapses whitespace in a title", () => {
    expect(goals.create({ title: "  two   words  " }).title).toBe("two words");
  });

  it("clamps progress into 0 to 100", () => {
    expect(goals.create({ title: "low", progress: -40 }).progress).toBe(0);
    expect(goals.create({ title: "high", progress: 400 }).progress).toBe(100);
  });

  it("treats a finished goal as fully complete", () => {
    const goal = goals.create({ title: "done already", status: "done", progress: 10 });
    expect(goal.progress).toBe(100);
  });

  it("falls back to active for an unknown status", () => {
    const goal = goals.create({ title: "odd", status: "elsewhere" as never });
    expect(goal.status).toBe("active");
  });

  it("updates a goal and moves it to the front", () => {
    const first = goals.create({ title: "first" });
    goals.create({ title: "second" });
    const updated = goals.update(first.id, { title: "first, renamed", status: "paused" });
    expect(updated.title).toBe("first, renamed");
    expect(updated.status).toBe("paused");
    expect(goals.list()[0]?.id).toBe(first.id);
  });

  it("sorts finished goals last", () => {
    const open = goals.create({ title: "open" });
    const finished = goals.create({ title: "finished" });
    goals.update(finished.id, { title: "finished", status: "done" });
    expect(goals.list().map((goal) => goal.id)).toEqual([open.id, finished.id]);
  });

  it("refuses to update a goal that is gone", () => {
    expect(() => goals.update("missing", { title: "nope" })).toThrow(/no longer exists/);
  });

  it("removes a goal", () => {
    const goal = goals.create({ title: "temporary" });
    goals.remove(goal.id);
    expect(goals.list()).toHaveLength(0);
  });
});
