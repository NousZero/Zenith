import { DatabaseSync } from "node:sqlite";

// Each entry upgrades the schema by one version; never edit a shipped migration.
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    memory_text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_updated_at ON sessions (updated_at DESC);

  CREATE TABLE panes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    included INTEGER NOT NULL,
    memory_enabled INTEGER NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  CREATE INDEX panes_session ON panes (session_id, position);

  -- parent_id links a message to the one before it; branches will share ancestors.
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    pane_id TEXT NOT NULL REFERENCES panes (id) ON DELETE CASCADE,
    parent_id TEXT,
    position INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX messages_pane ON messages (pane_id, position);
  `,
  `ALTER TABLE sessions ADD COLUMN personality_id TEXT NOT NULL DEFAULT '';`,
  `ALTER TABLE panes ADD COLUMN context_window INTEGER;`,
  `
  -- Full-text index over message content, kept in sync by triggers.
  CREATE VIRTUAL TABLE messages_fts USING fts5(
    content, content='messages', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts (rowid, content) VALUES (new.rowid, new.content);
  END;
  CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts (messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  END;
  CREATE TRIGGER messages_fts_update AFTER UPDATE OF content ON messages BEGIN
    INSERT INTO messages_fts (messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO messages_fts (rowid, content) VALUES (new.rowid, new.content);
  END;
  INSERT INTO messages_fts (messages_fts) VALUES ('rebuild');

  -- One row per finished reply; kept when sessions are deleted so insights stay complete.
  CREATE TABLE usage_events (
    id INTEGER PRIMARY KEY,
    session_id TEXT,
    pane_id TEXT,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    estimated INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX usage_events_created ON usage_events (created_at);
  `,
  `
  ALTER TABLE panes ADD COLUMN project_path TEXT;

  -- File contents saved before an agent changed them, so one reply can be rolled back.
  CREATE TABLE checkpoints (
    id INTEGER PRIMARY KEY,
    turn_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    file_path TEXT NOT NULL,
    before_content TEXT,
    existed INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (turn_id, file_path)
  );

  CREATE TABLE board_cards (
    id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX board_cards_project ON board_cards (project_path, updated_at);
  `,
  `
  CREATE TABLE bot_settings (
    platform TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    provider_id TEXT NOT NULL DEFAULT '',
    model_id TEXT NOT NULL DEFAULT ''
  );

  -- People allowed to talk to a bot, added only through desktop pairing codes.
  CREATE TABLE bot_users (
    platform TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    paired_at INTEGER NOT NULL,
    PRIMARY KEY (platform, user_id)
  );

  CREATE TABLE bot_messages (
    id INTEGER PRIMARY KEY,
    platform TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX bot_messages_chat ON bot_messages (platform, chat_id, id);
  `,
  `
  ALTER TABLE panes ADD COLUMN agent_path TEXT;
  ALTER TABLE panes ADD COLUMN plan_mode INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Git tree of a project taken before an agent reply, for undo that also covers commands.
  CREATE TABLE turn_snapshots (
    turn_id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    git_dir TEXT NOT NULL,
    tree TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  `
  -- The chat a paired person used, so scheduled results can be sent to them.
  ALTER TABLE bot_users ADD COLUMN chat_id TEXT;

  CREATE TABLE scheduled_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    schedule TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    deliver_to TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at INTEGER,
    last_run_at INTEGER,
    last_result TEXT,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );

  -- Optional meaning-based search: one vector per message for the chosen embedding model.
  CREATE TABLE message_embeddings (
    message_id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    vector BLOB NOT NULL
  );
  CREATE TRIGGER message_embeddings_delete AFTER DELETE ON messages BEGIN
    DELETE FROM message_embeddings WHERE message_id = old.id;
  END;

  CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // Images attached to a message, as a JSON list of references to files in the attachments folder.
  `ALTER TABLE messages ADD COLUMN images TEXT;`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const current = Number(
    (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
  );
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${current} is newer than this version of Zenith supports (${SCHEMA_VERSION}).`,
    );
  }
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version] ?? "");
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
