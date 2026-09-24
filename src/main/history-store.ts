import type { DatabaseSync } from "node:sqlite";

import { HIT_END, HIT_START, toFtsQuery } from "../shared/history";
import type {
  ChatRole,
  HistoryExcerpt,
  SearchResult,
  UsageInsights,
  UsageRecord,
} from "../shared/types";

const SEARCH_LIMIT = 50;
const RETRIEVE_LIMIT = 8;
const EXCERPT_MAX_CHARS = 1_500;

export function createHistoryStore(db: DatabaseSync, now: () => number = Date.now) {
  const statements = {
    search: db.prepare(
      `SELECT m.id AS message_id, m.role, s.id AS session_id, s.name AS session_name,
              p.name AS pane_name, p.provider_id, s.updated_at,
              snippet(messages_fts, 0, ?, ?, '…', 16) AS snippet
       FROM messages_fts
       JOIN messages m ON m.rowid = messages_fts.rowid
       JOIN panes p ON p.id = m.pane_id
       JOIN sessions s ON s.id = p.session_id
       WHERE messages_fts MATCH ?
       ORDER BY bm25(messages_fts)
       LIMIT ?`,
    ),
    retrieve: db.prepare(
      `SELECT m.role, m.content, m.created_at, s.name AS session_name, p.name AS pane_name
       FROM messages_fts
       JOIN messages m ON m.rowid = messages_fts.rowid
       JOIN panes p ON p.id = m.pane_id
       JOIN sessions s ON s.id = p.session_id
       WHERE messages_fts MATCH ? AND s.id IS NOT ?
       ORDER BY bm25(messages_fts)
       LIMIT ?`,
    ),
    record: db.prepare(
      `INSERT INTO usage_events (session_id, pane_id, provider_id, model_id, input_tokens,
                                 output_tokens, estimated, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    totals: db.prepare(
      `SELECT count(*) AS turns, coalesce(sum(input_tokens), 0) AS input_tokens,
              coalesce(sum(output_tokens), 0) AS output_tokens,
              coalesce(sum(estimated), 0) AS estimated_turns,
              count(DISTINCT session_id) AS sessions
       FROM usage_events WHERE created_at >= ?`,
    ),
    byConnection: db.prepare(
      `SELECT provider_id, model_id, count(*) AS turns, sum(input_tokens) AS input_tokens,
              sum(output_tokens) AS output_tokens
       FROM usage_events WHERE created_at >= ?
       GROUP BY provider_id, model_id
       ORDER BY sum(input_tokens + output_tokens) DESC`,
    ),
    byDay: db.prepare(
      `SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, count(*) AS turns,
              sum(input_tokens + output_tokens) AS tokens
       FROM usage_events WHERE created_at >= ?
       GROUP BY day ORDER BY day`,
    ),
  };

  return {
    search(query: string): SearchResult[] {
      const match = toFtsQuery(query, "all");
      if (!match) return [];
      const rows = statements.search.all(HIT_START, HIT_END, match, SEARCH_LIMIT) as unknown as {
        message_id: string;
        role: ChatRole;
        session_id: string;
        session_name: string;
        pane_name: string;
        provider_id: string;
        updated_at: number;
        snippet: string;
      }[];
      return rows.map((row) => ({
        messageId: row.message_id,
        role: row.role,
        sessionId: row.session_id,
        sessionName: row.session_name,
        paneName: row.pane_name,
        providerId: row.provider_id,
        snippet: row.snippet,
        updatedAt: row.updated_at,
      }));
    },

    // Keyword (bm25) retrieval; semantic-index.ts adds meaning matches when a model is set.
    // Recall leaves out the session asking, whose messages the model already has.
    retrieve(question: string, excludeSessionId: string | null = null): HistoryExcerpt[] {
      const match = toFtsQuery(question, "any");
      if (!match) return [];
      const rows = statements.retrieve.all(match, excludeSessionId, RETRIEVE_LIMIT) as unknown as {
        role: ChatRole;
        content: string;
        created_at: number;
        session_name: string;
        pane_name: string;
      }[];
      return rows.map((row) => ({
        sessionName: row.session_name,
        paneName: row.pane_name,
        role: row.role,
        content:
          row.content.length > EXCERPT_MAX_CHARS
            ? `${row.content.slice(0, EXCERPT_MAX_CHARS)}…`
            : row.content,
        at: row.created_at,
      }));
    },

    recordUsage(record: UsageRecord): void {
      statements.record.run(
        record.sessionId,
        record.paneId,
        record.providerId,
        record.modelId,
        Math.max(0, Math.round(record.inputTokens)),
        Math.max(0, Math.round(record.outputTokens)),
        record.estimated ? 1 : 0,
        now(),
      );
    },

    insights(sinceMs: number): UsageInsights {
      const totals = statements.totals.get(sinceMs) as {
        turns: number;
        input_tokens: number;
        output_tokens: number;
        estimated_turns: number;
        sessions: number;
      };
      const byConnection = statements.byConnection.all(sinceMs) as unknown as {
        provider_id: string;
        model_id: string;
        turns: number;
        input_tokens: number;
        output_tokens: number;
      }[];
      const byDay = statements.byDay.all(sinceMs) as unknown as {
        day: string;
        turns: number;
        tokens: number;
      }[];
      return {
        turns: totals.turns,
        inputTokens: totals.input_tokens,
        outputTokens: totals.output_tokens,
        estimatedTurns: totals.estimated_turns,
        sessions: totals.sessions,
        byConnection: byConnection.map((row) => ({
          providerId: row.provider_id,
          modelId: row.model_id,
          turns: row.turns,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
        })),
        byDay: byDay.map((row) => ({ day: row.day, turns: row.turns, tokens: row.tokens })),
      };
    },
  };
}
