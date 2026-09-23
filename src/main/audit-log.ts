import type { DatabaseSync } from "node:sqlite";

import type { AuditEntry, AuditKind } from "../shared/types";

// From Agamemnon's audit service: an append-only record of approvals, commands, edits, undos and
// checks, with secrets masked before anything is written and old entries trimmed.
const KEEP_ENTRIES = 5_000;
const MAX_SUMMARY_LENGTH = 500;

// ponytail: pattern-based masking of common key shapes and KEY=value assignments; a secret in
// an unusual shape is stored as typed. Upgrade path: reuse the secrets gate's scanner.
const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{20,})/g,
  /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi,
  /(Authorization:\s*Bearer\s+)\S+/gi,
];

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce(
    (result, pattern, index) =>
      result.replace(pattern, (match, first: string) =>
        index === 0 ? "[redacted]" : `${first}${index === 1 ? "=" : ""}[redacted]`,
      ),
    text,
  );
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
