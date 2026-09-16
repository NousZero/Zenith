import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { PaneMessage, PaneState, SessionState, SessionSummary } from "../shared/types";
import { transaction } from "./database";

export interface SessionStore {
  list(): Promise<SessionSummary[]>;
  load(id: string): Promise<SessionState | undefined>;
  save(session: SessionState): Promise<void>;
  delete(id: string): Promise<void>;
}

interface PaneRow {
  id: string;
  name: string;
  provider_id: string;
  model_id: string;
  included: number;
  memory_enabled: number;
  prompt_tokens: number;
  completion_tokens: number;
  last_error: string | null;
  context_window: number | null;
  project_path: string | null;
  agent_path: string | null;
  plan_mode: number;
}

interface MessageRow {
  id: string;
  role: PaneMessage["role"];
  content: string;
}

export function createSessionStore(db: DatabaseSync, now: () => number = Date.now): SessionStore {
  const statements = {
    list: db.prepare("SELECT id, name, updated_at FROM sessions ORDER BY updated_at DESC"),
    session: db.prepare(
      "SELECT id, name, memory_text, personality_id, updated_at FROM sessions WHERE id = ?",
    ),
    panes: db.prepare(
      `SELECT id, name, provider_id, model_id, included, memory_enabled, prompt_tokens,
              completion_tokens, last_error, context_window, project_path,
              agent_path, plan_mode
       FROM panes WHERE session_id = ? ORDER BY position`,
    ),
    messages: db.prepare(
      "SELECT id, role, content FROM messages WHERE pane_id = ? ORDER BY position",
    ),
    upsertSession: db.prepare(
      `INSERT INTO sessions (id, name, memory_text, personality_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, memory_text = excluded.memory_text,
         personality_id = excluded.personality_id, updated_at = excluded.updated_at`,
    ),
    upsertPane: db.prepare(
      `INSERT INTO panes (id, session_id, position, name, provider_id, model_id, included,
                          memory_enabled, prompt_tokens, completion_tokens, last_error,
                          context_window, project_path, agent_path, plan_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         session_id = excluded.session_id, position = excluded.position, name = excluded.name,
         provider_id = excluded.provider_id, model_id = excluded.model_id,
         included = excluded.included, memory_enabled = excluded.memory_enabled,
         prompt_tokens = excluded.prompt_tokens, completion_tokens = excluded.completion_tokens,
         last_error = excluded.last_error, context_window = excluded.context_window,
         project_path = excluded.project_path, agent_path = excluded.agent_path,
         plan_mode = excluded.plan_mode`,
    ),
    deleteStalePanes: db.prepare(
      "DELETE FROM panes WHERE session_id = ? AND id NOT IN (SELECT value FROM json_each(?))",
    ),
    upsertMessage: db.prepare(
      `INSERT INTO messages (id, pane_id, parent_id, position, role, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         pane_id = excluded.pane_id, parent_id = excluded.parent_id,
         position = excluded.position, role = excluded.role, content = excluded.content
       WHERE messages.content IS NOT excluded.content
          OR messages.position IS NOT excluded.position
          OR messages.parent_id IS NOT excluded.parent_id
          OR messages.pane_id IS NOT excluded.pane_id`,
    ),
    deleteStaleMessages: db.prepare(
      "DELETE FROM messages WHERE pane_id = ? AND id NOT IN (SELECT value FROM json_each(?))",
    ),
    deleteSession: db.prepare("DELETE FROM sessions WHERE id = ?"),
  };

  function loadPane(row: PaneRow): PaneState {
    const messages = (statements.messages.all(row.id) as unknown as MessageRow[]).map(
      ({ id, role, content }) => ({ id, role, content }),
    );
    return {
      id: row.id,
      name: row.name,
      providerId: row.provider_id,
      modelId: row.model_id,
      included: row.included === 1,
      memoryEnabled: row.memory_enabled === 1,
      messages,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      lastError: row.last_error,
      contextWindow: row.context_window,
      projectPath: row.project_path,
      agentPath: row.agent_path,
      planMode: row.plan_mode === 1,
    };
  }

  return {
    async list() {
      return (
        statements.list.all() as unknown as { id: string; name: string; updated_at: number }[]
      ).map((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at }));
    },

    async load(id) {
      const row = statements.session.get(id) as
        | {
            id: string;
            name: string;
            memory_text: string;
            personality_id: string;
            updated_at: number;
          }
        | undefined;
      if (!row) return undefined;
      const panes = (statements.panes.all(id) as unknown as PaneRow[]).map(loadPane);
      return {
        id: row.id,
        name: row.name,
        memoryText: row.memory_text,
        personalityId: row.personality_id,
        panes,
        updatedAt: row.updated_at,
      };
    },

    async save(session) {
      const timestamp = now();
      transaction(db, () => {
        statements.upsertSession.run(
          session.id,
          session.name,
          session.memoryText,
          session.personalityId,
          timestamp,
          session.updatedAt,
        );
        session.panes.forEach((pane, paneIndex) => {
          statements.upsertPane.run(
            pane.id,
            session.id,
            paneIndex,
            pane.name,
            pane.providerId,
            pane.modelId,
            pane.included ? 1 : 0,
            pane.memoryEnabled ? 1 : 0,
            pane.promptTokens,
            pane.completionTokens,
            pane.lastError,
            pane.contextWindow,
            pane.projectPath,
            pane.agentPath,
            pane.planMode ? 1 : 0,
          );
          pane.messages.forEach((message, messageIndex) => {
            statements.upsertMessage.run(
              message.id,
              pane.id,
              pane.messages[messageIndex - 1]?.id ?? null,
              messageIndex,
              message.role,
              message.content,
              timestamp,
            );
          });
          statements.deleteStaleMessages.run(
            pane.id,
            JSON.stringify(pane.messages.map((message) => message.id)),
          );
        });
        statements.deleteStalePanes.run(
          session.id,
          JSON.stringify(session.panes.map((pane) => pane.id)),
        );
      });
    },

    async delete(id) {
      statements.deleteSession.run(id);
    },
  };
}

type LegacyPane = Omit<
  PaneState,
  "messages" | "contextWindow" | "projectPath" | "agentPath" | "planMode"
> & {
  messages: { id?: string; role: PaneMessage["role"]; content: string }[];
};
type LegacySession = Omit<SessionState, "panes" | "personalityId"> & { panes: LegacyPane[] };

// One-time move from the JSON-file store. The folder is renamed, never deleted.
export async function importLegacyJsonSessions(
  store: SessionStore,
  sessionsDir: string,
): Promise<{ imported: number; backupDir?: string }> {
  if (!existsSync(sessionsDir)) return { imported: 0 };
  const files = (await readdir(sessionsDir)).filter((file) => file.endsWith(".json"));
  let imported = 0;
  for (const file of files) {
    let legacy: LegacySession;
    try {
      legacy = JSON.parse(await readFile(join(sessionsDir, file), "utf8")) as LegacySession;
    } catch {
      continue;
    }
    if (typeof legacy.id !== "string" || !Array.isArray(legacy.panes)) continue;
    if (await store.load(legacy.id)) continue;
    await store.save({
      ...legacy,
      personalityId: "",
      panes: legacy.panes.map((pane) => ({
        ...pane,
        lastError: pane.lastError ?? null,
        contextWindow: null,
        projectPath: null,
        agentPath: null,
        planMode: false,
        messages: pane.messages.map((message) => ({
          id: message.id ?? randomUUID(),
          role: message.role,
          content: message.content,
        })),
      })),
    });
    imported += 1;
  }

  let backupDir = `${sessionsDir}-json-backup`;
  if (existsSync(backupDir)) backupDir = `${backupDir}-${Date.now()}`;
  await rename(sessionsDir, backupDir);
  return { imported, backupDir };
}
