# ADR 0007: Single-use approvals and recoverable file transactions

**Status:** Accepted as the minimum policy architecture; G2 action classes and M3 definition action families frozen
**Date:** 2026-08-11

## Context

Zenith must let models propose powerful operations without treating a chat response, manifest, remembered preference, or old confirmation as authority. The visible operation can change between proposal and execution through user edits, external file changes, executable resolution, plugin updates, workspace movement, or policy changes.

Windows does not provide one atomic transaction spanning arbitrary file updates. A crash between replacements can leave partial results, so the product needs durable recovery rather than an inaccurate “atomic multi-file” promise.

## Decision

### Proposal

Every consequential app-mediated action becomes a validated immutable proposal containing:

- proposal/schema version and stable ID;
- requester/run/agent/skill identities;
- normalized operation type and arguments;
- workspace identity and normalized resolved targets;
- current base/content hashes and relevant metadata;
- resolved executable or plugin/server identity, version, path/hash, arguments, cwd, and environment-key names when applicable;
- provider/tool destination and effective context digest when applicable;
- policy version, risk description, recovery expectation, and creation time.

The renderer displays a faithful view derived from this proposal. Editing any material field creates a new proposal/digest.

### Approval capability

On approval, privileged main state creates a single-use capability with:

- SHA-256 digest of canonical proposal bytes;
- cryptographically random nonce;
- issuer/decision identity and timestamp;
- short expiry appropriate to the operation;
- workspace identity and relevant content/executable/plugin hashes;
- policy version and exact executor class;
- state: issued, consumed, expired, revoked, or invalidated.

Execution revalidates schema, sender/run ownership, capability state, digest, expiry, workspace/root/target identity, base hashes, executable/plugin identity, and policy immediately before side effect. It consumes the capability once. Any drift, replay, wrong executor, wrong workspace, or partial mismatch fails closed and requires a new proposal.

Remembered preferences may suppress prompts only for a narrowly defined immutable action class and policy. They are privileged policy records, never raw reusable capabilities and never stored in Markdown.

### G2 action classes

M2 adds exactly three executor classes to the harmless G1 preference proof:

| Executor class              | Consequential operation bound into the proposal                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `main.workspace-file.apply` | One regular text-file replacement, base/intended hashes, canonical root/target identities, encoding/size, recovery policy    |
| `utility.fixed-verifier`    | One bundled module/hash, fixed arguments, workspace/cwd, file hashes, environment keys, deadline/output budget               |
| `process.git-read`          | Absolute Git path/hash, exact status/diff arguments, repository identity/pre-state, environment keys, deadline/output budget |

Offline fake-provider events and tool-shaped output never receive an executor class. They remain untrusted proposal inputs until validated into one of the allowed action schemas. Workspace open/read requires explicit access trust and sender ownership but is not allowed to manufacture a write/process capability.

Before effect dispatch, each G2 capability is rechecked against the live owner/run, workspace access-trust version, root/target identity, content hashes, executor/policy version, expiry, cancellation state, and canonical proposal digest. The broker consumes it before invoking the executor. A crash after consumption but before a durable file journal leaves no mutation and requires reapproval; once a valid `prepared` journal exists, recovery authority is limited to that exact journal/digest and visible recovery choices.

### M3 definition action families

T0078 defines the following closed future executor families before M3 implementation. This decision adds no capability, IPC method, filesystem write, or executable authority by itself; the relevant RED/GREEN tasks must implement and prove each family. G2 executor classes are not widened.

| Executor class                    | Closed operation set                                                  | Exact postcondition                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.definition-library.publish` | `create`, `save`, `fork`, `import`                                    | The validated intended file/tree exists only beneath the controlled user library with the approved hashes; create/import do not overwrite; save matches the reviewed base; fork leaves bundled/source bytes unchanged |
| `main.definition-lifecycle.apply` | `enable`, `disable`, `select`, `trash`, `restore`, `permanent-delete` | Privileged state or the exact user/trash location reaches the approved state; bundled content is unchanged; restore never overwrites a third hash; permanent delete is explicitly irreversible                        |
| `main.definition-export.publish`  | `export`, `save-copy`                                                 | The main-picker destination contains the approved portable bytes/hashes only; no privileged state is exported; an existing destination is unchanged unless a new exact overwrite proposal was approved                |

Every definition proposal binds schema/version/stable ID, owner, action family and closed operation, definition kind/ID/layer/provenance, controlled source and target identity, base/current/intended file or inventory hashes, byte/file/depth budgets, parser/schema version, policy/executor version, recovery expectation, and visible risk. Import/export additionally bind the main-owned picker result without returning a raw path to the renderer. Workspace-origin proposals bind both access-trust and configuration-trust identities where the workspace layer could affect effective data.

Before effect, main reconstructs and revalidates the path/inventory, trust/owner, current hash or required absence, collision/reserved-name policy, content schema, capability digest/expiry/state, and exact executor/operation. Capability consumption occurs immediately before synchronous executor dispatch. The operation cannot switch families, widen from one file to a tree, change destination, overwrite policy, definition ID, or recovery mode after review.

Recovery is operation-specific:

- create/save/fork and one-file import use the proven durable `prepared` -> `ready` -> `applying` -> terminal journal ordering;
- directory import/export and directory trash/restore record a bounded manifest and each completed/pending step and may end `partial`/`recovery-required`; they never claim cross-file atomicity;
- enable/disable/select use privileged-state transactions and exact resulting version checks;
- trash retains verified bytes/metadata until its terminal record is durable; restore conflicts on an occupied or third-hash target; and
- cancellation before consumption has no effect, while cancellation after a completed move/copy cannot be described as reversal.

Audit contains correlated requested/approval/consumed/terminal records with structural definition identity, digests, counts, outcome, and sanitized error code. It excludes bodies, external raw paths, capabilities/nonces, grants, trust records, trash payloads, and export bytes.

### Central ownership

The minimal broker exists before editable definitions. Workspace configuration activation, definition writes, file operations, process/plugin starts, cooperative tool calls, secret-destination use, and Git mutations all use it. The broker's guarantee is limited to app-mediated paths; trusted executables can act directly outside it.

### Recoverable file transaction

For an approved multi-file change:

1. Create a durable journal in app-owned local state with transaction/proposal/capability IDs, workspace identity, base hashes, intended operations, and `prepared` state.
2. Re-resolve/re-authorize all targets and recheck base hashes.
3. Materialize replacement data into same-volume temporary files, validate size/hash/encoding, and flush file data where supported.
4. Record readiness before mutation.
5. Replace/move each target one at a time, recording completion and resulting hash after each step. Move deletions to recoverable app trash/snapshot when possible.
6. Mark `committed` only after all steps and postconditions pass; otherwise mark `partial` or `recovery-required` with exact completed/pending operations.
7. On startup, scan nonterminal journals, compare filesystem hashes, and offer deterministic continue/rollback/manual-recovery choices. Never silently call partial work “success.”

This is recoverably transactional, not cross-file atomic. Git may provide additional recovery but is never assumed.

G2 implements only the one-file subset defined by ADR 0004. Its execution ordering is: consume the exact capability; synchronously start the executor; durably create `prepared`; materialize and flush the replacement; record `ready`; revalidate; record `applying`; replace once; verify; record `committed`. No workspace mutation occurs before `prepared` is durable. Any failure after `applying` is reconciled from hashes on startup and never silently retried over a third-party change.

T0064 freezes this into the seven-state schema `prepared`, `ready`, `applying`, `committed`, `conflict`, `recovery-required`, and `rolled-back`. Startup may finalize `committed` only when the target has the intended hash, or remove incomplete artifacts and record `rolled-back` only when the target still has the reviewed base hash. Any third hash or uncertain post-mutation condition is explicit `recovery-required`; pre-replace external drift is `conflict`. No automatic recovery overwrites a target, and any later continue action requires a new exact approval.

T0065 implements that one-file boundary as a main-only, branded journal store and capability-consuming executor. It persists correlated requested audit before `prepared`, flushes base and same-directory replacement artifacts, freshly reauthorizes the workspace and target before `applying`, verifies immediately before and after the single replacement, and records a correlated terminal audit. Nine injected crash checkpoints, capability replay, external drift, root drift, missing target, temp collision, cancellation, in-place path race, double startup reconciliation, and outside canaries are GREEN. The executor is not constructed by the application yet; T0066 owns capability issuance plus visible apply and recovery presentation.

T0066 constructs the executor after durable state and audit initialization and exposes only a strict redacted propose/decide/recovery surface. The renderer never receives the capability, nonce, raw path, base snapshot, temporary artifact name, or journal mutation authority. A separate Apply once decision causes main to revalidate, issue, and immediately consume the capability. Recovery displays base/current/intended hashes and deterministic guidance; current identity is unavailable until the exact controlled file is open. Continue or rollback after conflict requires a new exact proposal, and manual recovery never overwrites third-party work. Exact Electron proves pre-replace rollback and post-replace commit twice across forced exits.

### Cancellation and audit

Cancellation before capability consumption prevents execution. During execution it becomes a request checked between safe steps; already completed external/file/process effects remain recorded. Audit links proposal, approval, capability consumption, journal steps, outcome, timestamps, and hashes without secrets.

## Alternatives

- **Boolean `approved` flag:** replayable and vulnerable to operation drift.
- **Approval by natural-language similarity:** ambiguous and not machine-verifiable.
- **Workspace-wide reusable write token:** too broad and unsafe to revoke/reason about.
- **Store grants in `.zenith` Markdown:** repository content could grant itself power.
- **Rename all files and claim atomicity:** Windows cannot make an arbitrary multi-file set atomic; a crash can occur between operations.
- **Require Git for recovery:** excludes empty/non-Git projects and does not cover untracked/external state reliably.

## Consequences

- Canonical encoding/digest rules become a versioned contract with test vectors.
- More user-visible reapproval occurs after legitimate external changes, which is safer than stale authority.
- Recovery UI and journals are required before broad multi-file support.
- A consumed capability with no prepared journal is safely spent but not recoverable; retry requires a fresh proposal. A prepared journal is not a reusable general write grant.
- Audit can prove exactly what was approved/executed but cannot reverse a trusted process's external side effects.

## Primary sources

- Node cryptographic random values: https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandombytessize-callback
- Node SHA-256 hashing: https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptocreatehashalgorithm-options
- Node filesystem rename/write/sync APIs: https://nodejs.org/docs/latest-v24.x/api/fs.html
- Electron main-owned native dialogs: https://www.electronjs.org/docs/latest/api/dialog
- SQLite transactions: https://www.sqlite.org/lang_transaction.html
- Windows file move behavior: https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw

## Revisit

At G2/G5 after injected interruption/replay/drift/path-race tests and at G3 after definition lifecycle/import/export crash and replay proof. G1 approval test vectors are complete. Any new action class must define its canonical proposal and postconditions before use.
