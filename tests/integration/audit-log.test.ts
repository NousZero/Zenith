import { mkdtemp, rm } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditLog, redact } from "../../src/main/audit-log";
import { openDatabase } from "../../src/main/database";

describe("audit log", () => {
  let dir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "zenith-audit-"));
    db = openDatabase(join(dir, "zenith.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("records entries newest first with secrets masked", () => {
    let clock = 1;
    const log = createAuditLog(db, () => clock++);
    log.record({ kind: "command", projectPath: "/p", summary: "npm test", outcome: "done" });
    log.record({
      kind: "approval",
      summary: "Run  OPENAI_API_KEY=sk-abcdefghijklmnop curl -H 'Authorization: Bearer abc.def' x",
      outcome: "allow_once",
    });
    const [latest, first] = log.list();
    expect(first).toEqual({
      id: 1,
      at: 1,
      kind: "command",
      projectPath: "/p",
      summary: "npm test",
      outcome: "done",
    });
    expect(latest?.summary).toBe(
      "Run OPENAI_API_KEY=[redacted] curl -H 'Authorization: Bearer [redacted] x",
    );
    expect(latest?.projectPath).toBeNull();
  });

  it("masks bare keys in any text", () => {
    expect(redact("token ghp_abcdefghijklmnopqrstuvwxyz0123 here")).toBe("token [redacted] here");
    expect(redact("nothing secret")).toBe("nothing secret");
  });

  it("masks a private key block, a pattern only the secrets gate list catches", () => {
    expect(redact("saving -----BEGIN RSA PRIVATE KEY----- to disk")).toBe(
      "saving [redacted] to disk",
    );
  });

  it("masks a quoted key literal, a pattern only the secrets gate list catches", () => {
    expect(redact('password: "abcdefghijklmnopqrstuvwxyz1234" in config')).toBe(
      "[redacted] in config",
    );
  });

  it("keeps only the newest 5000 entries", () => {
    const log = createAuditLog(db);
    // One transaction, so the test doesn't wait for 5,003 separate commits to reach the disk,
    // which on Windows takes longer than the test timeout.
    db.exec("BEGIN");
    for (let index = 0; index < 5_003; index++) {
      log.record({ kind: "edit", summary: `file ${index}`, outcome: "done" });
    }
    db.exec("COMMIT");
    expect(db.prepare("SELECT count(*) AS n FROM audit_log").get()).toEqual({ n: 5_000 });
    expect(log.list(1)[0]?.summary).toBe("file 5002");
  });
});
