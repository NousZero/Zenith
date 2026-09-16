# ADR 0004: Local definitions, state, credentials, and recovery

**Status:** Accepted; G1 compatibility, T0066 one-file recovery UI, and M3 definition-storage boundary frozen
**Date:** 2026-08-11

## Context

Zenith needs human-editable Soul/Role/Agent/Skill/Command/Plugin definitions, structured run/audit state, app-managed provider credentials, external-edit detection, migrations, and crash recovery. Windows roaming profile storage is a poor default for large local databases/logs and conflicts with the local-first/no-sync promise.

Electron `safeStorage` uses Windows DPAPI but explicitly does not protect data from other applications running as the same user. Current Electron recommends its asynchronous APIs. Node's built-in `node:sqlite` avoids a third-party native module, but its stability/packaging behavior must be proven inside the exact Electron runtime.

## Decision

### Layout

- Resolve and validate `%LOCALAPPDATA%\Zenith` in main before opening storage; do not use Electron's roaming `userData` default without overriding it.
- Keep global/user definitions as files under `library\` and workspace definitions under `<workspace>\.zenith`.
- Keep privileged grants, trust decisions, run/audit state, migrations, and secret references in `state.db` under the app-owned local directory.
- Keep encrypted credential payloads in `secrets.bin`; Markdown and SQLite rows hold opaque secret IDs only.
- Keep recoverable action journals, logs, and app trash in separate bounded directories with retention controls.

### Definitions

- New definitions use versioned validated schemas.
- Supplied legacy files load through adapters and sidecar provenance/hash metadata; never rewrite them merely to add fields.
- Write user definitions through the central approval broker and external-change/base-hash checks.

### M3 bundled snapshot and definition library

- The supplied snapshot is immutable application data under one manifest-defined version root inside the packaged application. Main resolves it from the application path, never from `D:\AI\skills\agent-skills`, and rejects a missing, extra, path-invalid, version-mismatched, or hash-mismatched resource. ASAR is read-only, but read-only packaging and ASAR header integrity do not replace the per-file manifest or code signing.
- Snapshot materialization is a build-time action from the explicitly reviewed source. Runtime may read bounded bytes and metadata only; it cannot repair, regenerate, update, or execute the snapshot.
- User-authored definitions remain beneath the fixed `%LOCALAPPDATA%\Zenith\library` layout in `SPEC.md`. Main constructs every kind-specific target from a validated kind and stable ID; neither renderer nor definition content supplies an absolute path. Built-ins are never mutated: editing one creates a user fork with explicit provenance.
- Workspace definitions remain beneath the already authorized `<workspace>\.zenith` root. M3 may preview bounded definition data after workspace access trust, but it may include that layer in the effective registry only while the exact workspace configuration-trust record/version/hash remains current. Grants, capabilities, enable state, and active profile selection remain in privileged state, never in definition files.
- Original source bytes and full SHA-256 are authoritative for external-change detection. Canonical parsed metadata is a disposable view. A parse, validation, collision, or trust failure never rewrites the source and never partially inserts an item into the effective registry.

### M3 definition changes and recovery

Definition changes reuse the central single-use approval architecture but use M3-specific proposals and journals. The main-owned definition service binds operation, owner, definition kind/ID/layer/provenance, controlled source/target identity, base/current/intended hashes, policy/executor version, and exact postcondition. It revalidates immediately before effect.

- Create, save, and fork publish one validated regular UTF-8 definition file beneath the controlled user library. Publication uses an exclusive same-directory temporary, size/encoding/hash validation, file sync where supported, `ready` before replacement, one replacement, reopen/hash verification, then `committed`. Create requires target absence; update requires the reviewed base hash; fork requires bundled/source bytes to remain unchanged.
- Disable/enable and active selection update privileged structured state only. Missing, colliding, trashed, invalid, or untrusted definitions cannot become effective merely because a stale selection record exists.
- Trash moves one exact user item or bounded skill directory into the app-owned trash with its identity, provenance, source/base hash, relative controlled target, and retention metadata. Restore requires target absence or an exact save-copy decision and never overwrites a third-party file. Permanent deletion is a distinct irreversible approval and never applies to bundled content.
- Import reads only user-selected bounded regular files or a bounded regular-file tree without archive extraction, reparse traversal, module import, script execution, or overwrite-by-default. Validation and a hash/inventory preview precede a separate publication approval. Imported grant/capability/enable fields are ignored or rejected, never honored.
- Export uses a main-owned save/folder dialog and an exact destination/content digest. It emits portable definition bytes only: no grants, capabilities, trust records, journals, trash metadata, credentials, or opaque secret references. Existing destinations require a new overwrite or save-copy proposal; cancellation has no success state.
- A single-file change can use the proven seven-state journal. A directory import/export or trash/restore is recoverably transactional with per-file steps and explicit `partial`/`recovery-required`; it is not called atomic. Startup reconciliation compares controlled source/target/artifact hashes, never guesses through a third hash, and never silently completes an externally changed operation.
- Audit stores structural identity/digest/state/count/error fields, not definition bodies, external raw paths, capability nonces, trash contents, or exported data. Bounded trash/journal retention never discards nonterminal recovery work.

### Structured state

- Put SQLite behind a narrow asynchronous storage service outside the renderer.
- Candidate implementation is built-in `node:sqlite` with prepared statements, extension loading disabled, defensive limits, serialized migrations, and pre-migration backups.
- M2 must prove the exact Electron-bundled Node API, package behavior, interruption/restart, and concurrency. If it fails, supersede this ADR and evaluate an exact-pinned native library with its lifecycle/build risk explicitly approved.

### Credentials

- Prefer `safeStorage` asynchronous availability/encrypt/decrypt operations after Electron app readiness.
- If encryption is unavailable or temporarily unavailable, block credential persistence/use with a recoverable state; never fall back to plaintext.
- Credential entry is transient renderer input sent through one purpose-specific IPC request, cleared immediately, and never retained in React/global state.
- This protects app-managed storage from other users/offline reading; it is not a defense against arbitrary code already running as the same logged-in user.

### Recovery

- Back up before schema migration.
- Use a write-ahead action journal for recoverable file transactions with workspace identity, base hashes, per-file steps, and terminal outcome.
- Represent incomplete/partial/recovery-required state explicitly; do not claim cross-file filesystem atomicity.

For G2's one-file proof, the main-owned journal is bounded, schema-versioned, and stored in the app-owned journal area. It contains no capability nonce or credential and records only the proposal/capability digest references, workspace/root/target identities, relative display path, base and intended hashes, bounded temp/snapshot references, state, timestamps, and sanitized error code.

The state machine is monotonic and uses seven closed states:

```text
prepared -> ready -> applying -> committed
prepared/ready ----------------> conflict
prepared/ready/applying -------> recovery-required
prepared/ready/applying -------> rolled-back (verified base only)
```

- `prepared` is durably recorded before any workspace mutation. A crash before this record leaves no authorized recovery work.
- Replacement bytes are written exclusively to a same-directory temporary file, size/encoding/hash checked, and flushed. Only then may the journal become `ready`.
- Root/target identity and base hash are revalidated. Drift records a conflict/recovery-required outcome without replacing the target.
- `applying` is flushed before the single replace. After replacement, the reopened target must match the intended hash before `committed` is flushed.
- Drift detected before replacement becomes `conflict` and never overwrites external work. Failures that cannot be proven pre-mutation become `recovery-required`.
- `rolled-back` means incomplete artifacts were removed only after proving the target still has the reviewed base hash; it never claims to reverse an unknown or externally changed target.
- Startup never calls an incomplete journal successful. If the target has the intended hash it may finalize idempotently; if it has the base hash it may remove incomplete artifacts and record `rolled-back`; any third hash, missing required artifact after possible mutation, or identity drift becomes `recovery-required` with no automatic overwrite. A later continue action requires a new exact approval.
- Temporary/snapshot artifacts are bounded and retained until a terminal record is durable. Cleanup is idempotent and never follows an unexpected link.
- Retention keeps the newest 32 terminal one-file journals, every nonterminal journal, and unrelated entries.
- File and journal handles are explicitly synced where the runtime supports it. This is crash-recovery engineering, not a guarantee against storage-device, filesystem, or power-loss behavior beyond the operating system's sync contract.

Broad or multi-file transactions remain deferred to G5 and must supersede this deliberately small state machine.

## Alternatives

- **All Markdown/JSON:** insufficient for relational run/audit/migration queries and transactional metadata.
- **All SQLite:** makes user definitions opaque and harms import/export/version-control workflows.
- **Electron default roaming userData:** rejected for local-only state and potentially large logs/databases.
- **Plaintext/environment-only credentials:** plaintext is unacceptable; environment-only is too brittle for a desktop settings UI and can leak to child processes.
- **Third-party native SQLite immediately:** deferred until built-in compatibility is tested, because it adds native lifecycle/rebuild/package risk.

## Consequences

- Storage location and migration behavior become explicit compatibility contracts.
- Same-user malicious processes remain outside the credential guarantee.
- Definition files remain portable while grants remain privileged and non-portable by default.
- Recovery adds journal/cleanup complexity but produces truthful failure states.
- G2 can recover or stop safely around one replacement, but it does not promise cross-volume rollback, power-loss atomicity, or preservation against a hostile same-user process.

## Primary sources

- Electron safeStorage API and Windows security semantics: https://www.electronjs.org/docs/latest/api/safe-storage
- Electron application paths: https://www.electronjs.org/docs/latest/api/app#appgetpathname
- Electron application root (`app.getAppPath`): https://www.electronjs.org/docs/latest/api/app#appgetapppath
- Electron ASAR read-only behavior and filesystem caveats: https://www.electronjs.org/docs/latest/tutorial/asar-archives
- Electron ASAR integrity scope: https://www.electronjs.org/docs/latest/tutorial/asar-integrity
- Node SQLite API: https://nodejs.org/docs/latest-v24.x/api/sqlite.html
- SQLite transaction behavior: https://www.sqlite.org/lang_transaction.html
- Node file-handle sync and filesystem APIs: https://nodejs.org/docs/latest-v24.x/api/fs.html
- Windows known folders: https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid

## Revisit

At G2 after interrupted one-file journal recovery, at G3 after definition lifecycle/import/export recovery, and at G5 before broad workspace or general multi-file mutation. The exact Electron runtime has already proven `node:sqlite`, asynchronous `safeStorage`, and migration backup/restore through G1.
