import type { DatabaseSync } from "node:sqlite";

import type { ChatRole, HistoryExcerpt, SemanticStatus } from "../shared/types";
import { providerFetch } from "./providers/http";

const SETTING_KEY = "semantic_search_model";
const BATCH_SIZE = 32;
// ponytail: indexes at most this many new messages per question and scans vectors in memory;
// move to a vector index if histories grow past a few hundred thousand messages.
const MAX_NEW_PER_SEARCH = 256;
const MAX_EMBED_CHARS = 2_000;
const MIN_CONTENT_CHARS = 20;
const EXCERPT_MAX_CHARS = 1_500;

export type Embedder = (model: string, texts: string[]) => Promise<number[][]>;

// Ollama's embedding endpoint; the model must be pulled first (e.g. nomic-embed-text).
export function ollamaEmbedder(baseUrl = "http://127.0.0.1:11434"): Embedder {
  return async (model, texts) => {
    const response = await providerFetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(120_000),
    }).catch(() => {
      throw new Error("Ollama isn't running. Open Ollama to use meaning-based search.");
    });
    const body = (await response.json().catch(() => ({}))) as {
      embeddings?: unknown;
      error?: string;
    };
    if (!response.ok || !Array.isArray(body.embeddings)) {
      throw new Error(body.error ?? `Ollama embedding failed: HTTP ${response.status}`);
    }
    return body.embeddings as number[][];
  };
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export function createSemanticIndex(db: DatabaseSync, embed: Embedder) {
  const statements = {
    getSetting: db.prepare("SELECT value FROM app_settings WHERE key = ?"),
    setSetting: db.prepare(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    ),
    clearSetting: db.prepare("DELETE FROM app_settings WHERE key = ?"),
    missing: db.prepare(
      `SELECT m.id, m.content FROM messages m
       LEFT JOIN message_embeddings e ON e.message_id = m.id AND e.model = ?
       WHERE e.message_id IS NULL AND m.role IN ('user', 'assistant') AND length(m.content) >= ?
       ORDER BY m.created_at DESC LIMIT ?`,
    ),
    store: db.prepare(
      "INSERT OR REPLACE INTO message_embeddings (message_id, model, vector) VALUES (?, ?, ?)",
    ),
    vectors: db.prepare(
      `SELECT e.vector, m.role, m.content, p.name AS pane_name, s.name AS session_name
       FROM message_embeddings e
       JOIN messages m ON m.id = e.message_id
       JOIN panes p ON p.id = m.pane_id
       JOIN sessions s ON s.id = p.session_id
       WHERE e.model = ?`,
    ),
    counts: db.prepare(
      `SELECT (SELECT count(*) FROM message_embeddings WHERE model = ?) AS indexed,
              (SELECT count(*) FROM messages WHERE role IN ('user', 'assistant') AND length(content) >= ?) AS total`,
    ),
  };

  const model = () =>
    (statements.getSetting.get(SETTING_KEY) as { value: string } | undefined)?.value ?? "";

  async function indexNew(activeModel: string, limit: number): Promise<number> {
    const rows = statements.missing.all(activeModel, MIN_CONTENT_CHARS, limit) as unknown as {
      id: string;
      content: string;
    }[];
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const vectors = await embed(
        activeModel,
        batch.map((row) => row.content.slice(0, MAX_EMBED_CHARS)),
      );
      batch.forEach((row, index) => {
        const vector = vectors[index];
        if (vector) {
          statements.store.run(row.id, activeModel, Buffer.from(new Float32Array(vector).buffer));
        }
      });
    }
    return rows.length;
  }

  function status(): SemanticStatus {
    const activeModel = model();
    const counts = statements.counts.get(activeModel, MIN_CONTENT_CHARS) as {
      indexed: number;
      total: number;
    };
    return { model: activeModel, indexed: activeModel ? counts.indexed : 0, total: counts.total };
  }

  return {
    status,

    // Checks the model answers before saving it; an empty name turns meaning search off.
    async setModel(name: string) {
      const trimmed = name.trim();
      if (!trimmed) {
        statements.clearSetting.run(SETTING_KEY);
        return status();
      }
      await embed(trimmed, ["test"]);
      statements.setSetting.run(SETTING_KEY, trimmed);
      return status();
    },

    async search(question: string, limit: number): Promise<HistoryExcerpt[]> {
      const activeModel = model();
      if (!activeModel || question.trim() === "") return [];
      await indexNew(activeModel, MAX_NEW_PER_SEARCH);
      const [queryVector] = await embed(activeModel, [question.slice(0, MAX_EMBED_CHARS)]);
      if (!queryVector) return [];
      const query = new Float32Array(queryVector);
      const rows = statements.vectors.all(activeModel) as unknown as {
        vector: Uint8Array;
        role: ChatRole;
        content: string;
        pane_name: string;
        session_name: string;
      }[];
      return rows
        .map((row) => {
          const bytes = new Uint8Array(row.vector);
          const vector = new Float32Array(
            bytes.buffer,
            bytes.byteOffset,
            Math.floor(bytes.byteLength / 4),
          );
          return { row, score: cosine(query, vector) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ row }) => ({
          sessionName: row.session_name,
          paneName: row.pane_name,
          role: row.role,
          content:
            row.content.length > EXCERPT_MAX_CHARS
              ? `${row.content.slice(0, EXCERPT_MAX_CHARS)}…`
              : row.content,
        }));
    },
  };
}

// Meaning matches first, then keyword matches, without repeating a message.
export function mergeExcerpts(
  semantic: readonly HistoryExcerpt[],
  keyword: readonly HistoryExcerpt[],
  limit: number,
): HistoryExcerpt[] {
  const seen = new Set<string>();
  const merged: HistoryExcerpt[] = [];
  for (const excerpt of [...semantic, ...keyword]) {
    const key = `${excerpt.sessionName} ${excerpt.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(excerpt);
    if (merged.length >= limit) break;
  }
  return merged;
}
