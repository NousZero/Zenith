import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { writeFileAtomic } from "./atomic-write";

import type { AgentTodo, BoardCard, BoardStatus } from "../shared/types";
import { transaction } from "./database";

// ponytail: whole-file text snapshots; larger files are not checkpointed.
const MAX_CHECKPOINT_BYTES = 5_000_000;

const TODO_STATUS: Record<AgentTodo["status"], BoardStatus> = {
  pending: "todo",
  in_progress: "doing",
  completed: "done",
};

export function createProjectStore(db: DatabaseSync, now: () => number = Date.now) {
  const statements = {
    saveCheckpoint: db.prepare(
      `INSERT OR IGNORE INTO checkpoints
         (turn_id, project_path, file_path, before_content, existed, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    checkpoints: db.prepare(
      "SELECT file_path, before_content, existed FROM checkpoints WHERE turn_id = ? ORDER BY id DESC",
    ),
    deleteCheckpoints: db.prepare("DELETE FROM checkpoints WHERE turn_id = ?"),
    cards: db.prepare(
      `SELECT id, project_path, title, status, updated_at FROM board_cards
       WHERE project_path = ? ORDER BY created_at`,
    ),
    cardByTitle: db.prepare(
      "SELECT id, status FROM board_cards WHERE project_path = ? AND title = ?",
    ),
    upsertCard: db.prepare(
      `INSERT INTO board_cards (id, project_path, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         title = excluded.title, status = excluded.status, updated_at = excluded.updated_at`,
    ),
    deleteCard: db.prepare("DELETE FROM board_cards WHERE id = ?"),
  };

  function listCards(projectPath: string): BoardCard[] {
    const rows = statements.cards.all(projectPath) as unknown as {
      id: string;
      project_path: string;
      title: string;
      status: BoardStatus;
      updated_at: number;
    }[];
    return rows.map((row) => ({
      id: row.id,
      projectPath: row.project_path,
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at,
    }));
  }

  return {
    // Saves a file's contents before its first change in a turn. Returns false if it was too large.
    async saveCheckpoint(turnId: string, projectPath: string, filePath: string): Promise<boolean> {
      let before: string | null = null;
      try {
        const buffer = await readFile(filePath);
        if (buffer.byteLength > MAX_CHECKPOINT_BYTES) return false;
        before = buffer.toString("utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      statements.saveCheckpoint.run(
        turnId,
        projectPath,
        filePath,
        before,
        before === null ? 0 : 1,
        now(),
      );
      return true;
    },

    // Restores every file a turn changed, newest change first, and forgets the checkpoint.
    async rollback(turnId: string): Promise<string[]> {
      const rows = statements.checkpoints.all(turnId) as unknown as {
        file_path: string;
        before_content: string | null;
        existed: number;
      }[];
      for (const row of rows) {
        if (row.existed === 1) {
          await mkdir(dirname(row.file_path), { recursive: true });
          await writeFileAtomic(row.file_path, row.before_content ?? "");
        } else {
          await unlink(row.file_path).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
      }
      statements.deleteCheckpoints.run(turnId);
      return rows.map((row) => row.file_path);
    },

    listCards,

    saveCard(card: { id?: string; projectPath: string; title: string; status: BoardStatus }) {
      const timestamp = now();
      statements.upsertCard.run(
        card.id ?? randomUUID(),
        card.projectPath,
        card.title,
        card.status,
        timestamp,
        timestamp,
      );
      return listCards(card.projectPath);
    },

    deleteCard(id: string, projectPath: string) {
      statements.deleteCard.run(id);
      return listCards(projectPath);
    },

    // Mirrors an agent's todo list onto the board, matching cards by title.
    syncTodos(projectPath: string, todos: readonly AgentTodo[]) {
      const timestamp = now();
      transaction(db, () => {
        for (const todo of todos) {
          const title = todo.content.trim();
          if (!title) continue;
          const existing = statements.cardByTitle.get(projectPath, title) as
            { id: string; status: BoardStatus } | undefined;
          const status = TODO_STATUS[todo.status];
          if (existing?.status === status) continue;
          statements.upsertCard.run(
            existing?.id ?? randomUUID(),
            projectPath,
            title,
            status,
            timestamp,
            timestamp,
          );
        }
      });
    },
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
