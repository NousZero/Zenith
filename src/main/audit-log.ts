import type { DatabaseSync } from "node:sqlite";

import type { AuditEntry, AuditKind } from "../shared/types";
import { SECRETS } from "./gates";

// From Agamemnon's audit service: an append-only record of approvals, commands, edits, undos and
// checks, with secrets masked before anything is written and old entries trimmed.
const KEEP_ENTRIES = 5_000;
const MAX_SUMMARY_LENGTH = 500;

// Bare secret values reuse the secrets gate's named pattern list (src/main/gates.ts) as the one
// source of truth, so the two scanners can't drift apart. Those patterns are line tests, so a "g"
// flag is added where it's missing to replace every occurrence in an entry, not just detect one.
// KEY=value assignments and Authorization headers aren't in that list, and need their surrounding
// context kept readable rather than replaced outright, so those two shapes stay local.
const BARE_SECRET_PATTERNS: readonly RegExp[] = SECRETS.map(({ pattern }) =>
  pattern.flags.includes("g") ? pattern : new RegExp(pattern.source, `${pattern.flags}g`),
);
const ASSIGNMENT_PATTERN =
  /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi;
const BEARER_PATTERN = /(Authorization:\s*Bearer\s+)\S+/gi;

export function redact(text: string): string {
  const withoutBareSecrets = BARE_SECRET_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, "[redacted]"),
    text,
  );
  return withoutBareSecrets
    .replace(ASSIGNMENT_PATTERN, (_match, key: string) => `${key}=[redacted]`)
    .replace(BEARER_PATTERN, (_match, prefix: string) => `${prefix}[redacted]`);
}

export function createAuditLog(db: DatabaseSync, now: () => number = Date.now) {
  const statements = {
    insert: db.prepare(
      "INSERT INTO audit_log (at, kind, project_path, summary, outcome) VALUES (?, ?, ?, ?, ?)",
    ),
    trim: db.prepare(
      "DELETE FROM audit_log WHERE id <= (SELECT id FROM audit_log ORDER BY id DESC LIMIT 1 OFFSET ?)",
    ),
    list: db.prepare(
      "SELECT id, at, kind, project_path, summary, outcome FROM audit_log ORDER BY id DESC LIMIT ?",
    ),
  };

  return {
    record(entry: {
      kind: AuditKind;
      projectPath?: string | null;
      summary: string;
      outcome: string;
    }) {
      statements.insert.run(
        now(),
        entry.kind,
        entry.projectPath ?? null,
        redact(entry.summary.replace(/\s+/g, " ").trim()).slice(0, MAX_SUMMARY_LENGTH),
        redact(entry.outcome).slice(0, MAX_SUMMARY_LENGTH),
      );
      statements.trim.run(KEEP_ENTRIES);
    },

    list(limit = 200): AuditEntry[] {
      return (
        statements.list.all(Math.max(1, Math.min(limit, KEEP_ENTRIES))) as unknown as {
          id: number;
          at: number;
          kind: AuditKind;
          project_path: string | null;
          summary: string;
          outcome: string;
        }[]
      ).map((row) => ({
        id: row.id,
        at: row.at,
        kind: row.kind,
        projectPath: row.project_path,
        summary: row.summary,
        outcome: row.outcome,
      }));
    },
  };
}

export type AuditLog = ReturnType<typeof createAuditLog>;
