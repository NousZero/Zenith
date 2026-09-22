import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { Goal, GoalInput, GoalStatus } from "../shared/types";

const STATUSES: readonly GoalStatus[] = ["active", "paused", "done"];
const MAX_TITLE_LENGTH = 200;
const MAX_DETAIL_LENGTH = 2_000;

function cleanTitle(value: unknown): string {
  const title = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) throw new Error("A goal needs a title.");
  return title.slice(0, MAX_TITLE_LENGTH);
}

function cleanStatus(value: unknown): GoalStatus {
  return STATUSES.includes(value as GoalStatus) ? (value as GoalStatus) : "active";
}

// A finished goal reads as complete even if its progress was never dragged to the end.
function cleanProgress(value: unknown, status: GoalStatus): number {
  if (status === "done") return 100;
  const progress = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(100, progress));
}

export function createGoalsStore(db: DatabaseSync, now: () => number = Date.now) {
  const statements = {
    list: db.prepare(
      `SELECT id, title, detail, status, progress, created_at, updated_at
       FROM goals ORDER BY status = 'done', updated_at DESC`,
    ),
    insert: db.prepare(
      `INSERT INTO goals (id, title, detail, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    update: db.prepare(
      `UPDATE goals SET title = ?, detail = ?, status = ?, progress = ?, updated_at = ?
       WHERE id = ?`,
    ),
    remove: db.prepare("DELETE FROM goals WHERE id = ?"),
    byId: db.prepare("SELECT id FROM goals WHERE id = ?"),
  };

  interface Row {
    id: string;
    title: string;
    detail: string;
    status: string;
    progress: number;
    created_at: number;
    updated_at: number;
  }

  const toGoal = (row: Row): Goal => ({
    id: row.id,
    title: row.title,
    detail: row.detail,
    status: cleanStatus(row.status),
    progress: row.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return {
    list(): Goal[] {
      return (statements.list.all() as unknown as Row[]).map(toGoal);
    },

    create(input: GoalInput): Goal {
      const status = cleanStatus(input.status);
      const goal: Goal = {
        id: randomUUID(),
        title: cleanTitle(input.title),
        detail: String(input.detail ?? "").slice(0, MAX_DETAIL_LENGTH),
        status,
        progress: cleanProgress(input.progress, status),
        createdAt: now(),
        updatedAt: now(),
      };
      statements.insert.run(
        goal.id,
        goal.title,
        goal.detail,
        goal.status,
        goal.progress,
        goal.createdAt,
        goal.updatedAt,
      );
      return goal;
    },

    update(id: string, input: GoalInput): Goal {
      if (!statements.byId.get(id)) throw new Error("That goal no longer exists.");
      const status = cleanStatus(input.status);
      const title = cleanTitle(input.title);
      const detail = String(input.detail ?? "").slice(0, MAX_DETAIL_LENGTH);
      const progress = cleanProgress(input.progress, status);
      const updatedAt = now();
      statements.update.run(title, detail, status, progress, updatedAt, id);
      const row = (statements.list.all() as unknown as Row[]).find((entry) => entry.id === id);
      if (!row) throw new Error("That goal no longer exists.");
      return toGoal(row);
    },

    remove(id: string): void {
      statements.remove.run(id);
    },
  };
}

export type GoalsStore = ReturnType<typeof createGoalsStore>;
