# M2 Development Journal

- **Milestone:** M2 / Gate G2 - early offline one-file coding loop
- **Journal opened:** 2026-08-11 (Asia/Tokyo)
- **Status:** T0050-T0076 complete; Gate G2 is GREEN for the verified local technical boundary
- **Current action:** Expand M3 into an atomic, dependency-ordered plan before adding new authority

## Purpose and update rules

This is the concise, resumable record of M2 development. It records reviewable engineering rationale, verified outcomes, commands and evidence references, known limitations, and the next authorized action. It is not a substitute for the product contract or task tracker.

- `SPEC.md` remains the product and security contract.
- `PLAN.md` remains the milestone roadmap.
- `tasks/plan.md` contains the current dependency-ordered M2 execution plan, T0050-T0076.
- `tasks/todo.md` remains the authoritative current execution pointer.
- `tasks/evidence/` contains acceptance proof; this journal links to evidence rather than replacing it.
- Only verified facts are written as completed. Planned work, inferred behavior, and unexecuted commands are labeled explicitly.
- After each verified phase, append the outcome, exact commands, evidence and screenshot paths, limitations, Git ownership/result, and next action. Do not rewrite historical entries to imply a cleaner result than occurred.
- The user currently owns every Git operation. Documentation agents do not stage, commit, or push; a later exact delegation is required before that boundary changes.

## Verified starting state

Gate G1 is the inherited green baseline. The application currently provides the hardened Electron shell and privileged policy foundation, not a functional coding assistant.

| Area                  | Verified baseline                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop boundary      | Sandboxed Electron renderer, context isolation, narrow frozen preload, versioned IPC, sender ownership, deadlines, cancellation, and late-result denial |
| Policy                | Digest-bound, expiring, single-use approval capabilities with replay, drift, expiry, and wrong-owner denial                                             |
| Trust and state       | Separate workspace access/configuration trust machines; main-owned SQLite migrations, recovery, durable trust, and revocation                           |
| Credentials and audit | Main-only encrypted credential storage without plaintext fallback; structurally redacted 256-event local audit; bounded diagnostics                     |
| Interface             | Responsive security/application chrome with trust, policy, recovery, credential, audit, and approval surfaces                                           |
| Verification          | 40 unit, 42 integration, 5 component, 18 active security, and 5 exact Electron E2E scenarios; E2E passed twice with zero retries                        |
| Package               | Unsigned Windows x64 package; all 75 unpacked production files reproduced byte-for-byte; ZIP container itself is not claimed bit-reproducible           |
| Git handoff           | `main` at `56cc026c55211727ec6dbfad7eab09cc86576297`, tracking `origin/main`; the journal was opened from a clean worktree                              |

Primary baseline evidence: `tasks/evidence/g1.md`. Supporting phase evidence and screenshots are under `tasks/evidence/` and `tasks/evidence/artifacts/`.

The user refers to the uploaded baseline as version 0.0.1. The checked-in package manifest still declares `0.0.0-private`; do not silently equate the upload label with the package version or change version metadata outside a planned release/versioning task.

## Current product limitations

At this starting point, Zenith cannot yet:

- browse or open an arbitrary project, enumerate a directory, read sibling files, or edit files; T0055 permits only one explicitly user-selected bounded UTF-8 file preview;
- initiate a general provider run; one deliberately narrow main route now invokes the fixed fake only to build a reviewed one-file proposal;
- perform arbitrary, multi-file, or unreviewed edits; the app can apply exactly one reviewed replacement to the explicitly selected file once;
- automatically continue or overwrite a conflicted recovery; the app shows redacted guidance and requires reopening plus a new reviewed proposal or manual recovery;
- run an arbitrary test, terminal command, or package script, or perform general Git/repository inspection; the app can run only the fixed approved G2 verifier and inspect only the selected tracked file through the hardened read-only Git route;
- activate Souls, Roles, Agents, Skills, Commands, Plugins, MCP, or profiles;
- use OpenAI, Anthropic, OpenRouter, NVIDIA NIM, a local provider, OmniRoute, Gemini CLI, or voice capture.

Most visible project and assistant areas remain foundation UI until their owning gates are complete. The Workspace pane now has the narrow controlled G2 loop described below. T0075 produced and inspected an unsigned G2 package, but it is not a signed public release or installer.

## Engineering approach for M2

The project records decision rationale, constraints, and evidence rather than private chain-of-thought. M2 will use these reviewable principles:

1. **Plan before authority.** Define atomic acceptance, denial, cancellation, conflict, recovery, package, and evidence criteria before production code.
2. **Offline and deterministic first.** Prove the complete interaction with a fake provider and controlled temporary fixtures before introducing credentials, remote variability, or egress.
3. **Increase authority one slice at a time.** Add read access, then fake streaming, then proposal generation, then one approved write, then one separately approved process, then read-only Git inspection.
4. **Treat paths as hostile input.** Canonicalize and bind the workspace identity; reject traversal, aliases, links/reparse points, device/extended paths, alternate data streams, reserved names, and root drift; revalidate immediately before use.
5. **Separate observation, proposal, and execution.** Reading a file does not authorize an edit. A model response is data. Mutation occurs only through a typed proposal and a valid single-use capability bound to current hashes and policy.
6. **Prefer recovery over optimistic atomicity.** Persist intent before mutation, use a recoverable journal and temp/replace flow, surface conflicts and interrupted states, and never claim cross-file filesystem atomicity.
7. **Approve processes independently.** The one M2 test command must display and bind its exact executable, arguments, working directory, environment-key policy, timeout, and reason. Current-user authority and cancellation limits remain visible.
8. **Harden Git inspection.** Read status/diff without enabling repository-controlled helpers, hooks, filters, pagers, text conversion, or submodule execution.
9. **Prove denial and restart behavior.** RED/GREEN tests cover bypasses as well as the happy path. Exact Electron E2E must include replay resistance, recovery, audit correlation, and restart/reopen.
10. **Keep later gates out of scope.** No real provider, generalized workspace editor, agent/skill runtime, plugin/MCP process, broad terminal, OmniRoute, Gemini CLI, or voice capability enters M2.

## Atomic execution range and boundaries

T0050 expanded the eight roadmap packages into the exact atomic range **T0050-T0076**. T0051 froze threat boundaries; T0052-T0066 completed controlled read, offline proposal, Apply once, and recovery; T0067-T0069 delivered only the fixed approved verifier and its bounded Tests-panel flow; T0070-T0071 delivered hardened selected-file Git inspection; T0072-T0073 completed audit/diagnostics and the accessible six-step workflow; T0074 proved the complete exact Electron matrix twice; T0075 built and inspected the unsigned hardened G2 package; and T0076 reproduced its complete unpacked payload from a fresh source-only tree. T0050-T0076 and local Gate G2 are complete; the next development action is M3 atomic expansion, not unplanned runtime authority.

| Atomic range | Dependency and scope boundary                                                                                                                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0050-T0051  | Planning and threat/ADR review only. T0051 closed the identified Windows path, journal, offline tool-proposal, fixed-verifier, hardened Git-read, and same-user-race questions needed to begin RED tests; unsupported or ambiguous runtime facts still fail closed.                                         |
| T0052-T0056  | RED hostile-path tests precede the main-owned read-only authorizer, IPC/UI connection, and exact Electron denial/restart proof. Only one explicitly selected bounded text file in a controlled temporary workspace is readable; no enumeration, write, Git, process, provider, or configuration activation. |
| T0057-T0060  | RED provider/abort tests precede a deterministic offline fake and immutable visible run manifest. No credentials, SDK, socket, DNS, subprocess, real endpoint, silent fallback, or hidden destination is allowed.                                                                                           |
| T0061-T0063  | RED canonical proposal/diff tests and the closed approval executor precede the visible one-file proposal. Model output remains untrusted data and disk must remain unchanged.                                                                                                                               |
| T0064-T0066  | RED journal/crash/conflict fixtures precede the first write. The single approved one-file replacement requires immediate path/base revalidation, requested audit, durable journal, single-use capability, recovery states, and exact Electron restart proof.                                                |
| T0067-T0069  | RED process vectors precede one exact, approved, no-shell G2 test fixture and its UI. This is not general terminal, package-script, PATH-search, or arbitrary command authority.                                                                                                                            |
| T0070-T0071  | RED hostile-repository fixtures precede fixed, non-interactive, read-only Git status/diff. Repository helpers, hooks, filters, text conversion, credentials, optional locks, prompts, submodules, and mutations remain disabled.                                                                            |
| T0072-T0073  | Bounded audit/diagnostics correlation precedes integrated visible workbench behavior; content, paths, prompts, diffs, command output, and secrets remain excluded from audit/support output.                                                                                                                |
| T0074-T0076  | The complete exact Electron denial/restart/recovery matrix precedes package inspection and frozen fresh-tree reproduction. Gate G2 cannot be claimed before all inherited boundaries, package scans, documentation, phase pushes, and reproducibility evidence are green.                                   |

The roadmap-to-atomic mapping remains:

| Phase | Intended capability                                                           | Required evidence before completion                                                                                 |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| M2.1  | Open one controlled temporary workspace and read one explicitly selected file | Canonical workspace identity plus hostile Windows path denial matrix; no repository content executes                |
| M2.2  | Deterministic offline fake provider                                           | Normalized streaming/tool-proposal events, abort and partial-stream behavior, and proof of zero network access      |
| M2.3  | Minimal visible run manifest                                                  | Destination, selected file, fixed master, context budget, tool schema, policy, and omissions visible before send    |
| M2.4  | One-file edit proposal                                                        | Typed proposal and visible diff bound to the original base hash; file bytes unchanged before approval               |
| M2.5  | Recoverably apply one approved edit                                           | Single-use approval, execution-time revalidation, durable journal, temp/replace, conflict and recovery states       |
| M2.6  | Run one controlled test command                                               | Separate exact approval, bounded output, exit code, timeout, ownership, cleanup, and truthful cancellation state    |
| M2.7  | Inspect hardened Git diff and audit                                           | Read-only status/diff with repo helpers disabled and end-to-end correlation across request, decisions, and outcomes |
| M2.8  | Complete the offline Electron loop                                            | Open -> fake request -> approve edit -> approve test -> inspect -> restart/reopen; package and fresh-tree evidence  |

Gate G2 becomes green only when every mutation in the temporary repository is attributable, replay-resistant, recoverable, and visible, and all inherited G0/G1 boundaries remain green.

### M2 exclusions

The atomic plan does not authorize arbitrary workspaces, broad filesystem edits, directory operations, real providers/network egress, editable definitions, agent/skill execution, plugins, MCP, general terminal or package scripts, mutating Git operations, OmniRoute, Gemini CLI, or voice. These remain owned by later gates. Through T0068, a hard-coded main-only verifier can run under exact privileged tests, but the app does not construct it or expose process proposal, approval, output, cancellation, IPC, preload, or UI controls.

## Development log

### 2026-08-11 - Journal initialization

**State:** Documentation-only preparation; no M2 product behavior implemented.

**Reviewed:** `AGENTS.md`, `SPEC.md`, `PLAN.md`, `tasks/todo.md`, `tasks/plan.md`, `docs/PROJECT-STATUS-AND-ROADMAP.md`, and `tasks/evidence/g1.md`.

**Read-only checks:**

```text
git status --porcelain=v1
git rev-parse HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{u}
package.json name/version inspection
```

**Observed:** clean starting tree; HEAD `56cc026c55211727ec6dbfad7eab09cc86576297`; upstream `origin/main`; package identity `zenith@0.0.0-private`.

**Decision:** Open this journal without changing production code, task completion state, acceptance claims, version metadata, or Git history.

**Evidence reference:** `tasks/evidence/g1.md` is the authoritative completed-gate baseline. No new acceptance evidence was produced by this documentation step.

**Next action:** Write and review the atomic M2 execution plan, beginning with the smallest bounded capability: a controlled temporary workspace and one explicitly selected read-only file operation.

### 2026-08-11 - T0050 atomic-plan checkpoint

**State:** T0050 planning work is complete in the current documentation set. No workspace, provider, file-edit, process, Git, or other M2 production authority was implemented.

**Outcome:** `tasks/plan.md` now defines T0050-T0076 with a resolvable dependency chain from contract validation through Gate G2 reproduction. The chain puts authorization before reads, proposal/broker work before writes, journal/recovery work before mutation, exact approval before the one fixed no-shell process, and hostile Git tests before read-only Git inspection.

**Scope decision:** M2 remains one controlled temporary workspace, one selected text file, one deterministic offline fake, one base-hash-bound edit, one recoverable replacement, one fixed test fixture, and read-only hardened Git inspection. Later-gate authority is explicitly excluded.

**Documentation consistency reviewed:** `README.md`, `AGENTS.md`, `docs/PROJECT-STATUS-AND-ROADMAP.md`, `tasks/plan.md`, and `tasks/todo.md` all identify T0050-T0076 and preserve the statement that production project/provider behavior does not exist. The durable roadmap, README, and agent context identify T0051 as the next implementation-precondition review. Task completion remains governed by `tasks/todo.md` and phase evidence owned by the implementing session.

**Phase-end rule at this checkpoint:** After verification, capture a fresh real-Electron preview and synchronize README, status/roadmap, task checklist, journal, and relevant evidence. Git ownership was subsequently clarified: the user owns staging, commits, and pushes unless an exact Git operation is delegated again.

**Next task:** T0051 only - refresh the threat model and affected decisions for canonical Windows identity/no-follow handling, execution-time revalidation, base-hash conflict, journal durability/recovery, fixed-runner authority disclosure, hardened non-mutating Git reads, and residual same-user races. Critical/high uncertainty blocks T0052.

### 2026-08-11 - T0051 threat and decision boundary review

**State:** T0051 is complete as a documentation/security review. No workspace reader, file mutation, provider, process runner, or Git adapter was implemented or invoked by Zenith.

**Primary-source review:** Official Microsoft documentation was used for Windows filenames/namespaces, alternate data streams, reparse points, hard links, and junctions; Node 24 documentation for open-versus-precheck races, `lstat`/`stat`/realpath, opened-file identity, and sync semantics; Electron documentation for `utilityProcess` behavior and termination limits; and Git documentation for porcelain output, optional locks, lazy fetch, configuration/environment precedence, hooks, protocols, external diff, and text conversion. Durable source URLs are recorded in the threat model and affected ADRs.

**Frozen boundaries:**

- **Path/read:** one explicit canonical local-drive root and one existing bounded regular text file; relative-only input, component/reparse inspection, realpath containment, stable identities, same-handle read/hash, and execution-time revalidation. String-prefix authority, hard-linked ambiguity, unsupported namespaces, and uncertain Windows facts deny.
- **One-file journal:** a digest/base-hash-bound, monotonic `prepared -> ready -> applying -> committed` recovery record with explicit conflict, recovery-required, and discarded outcomes. It is not a reusable grant or a cross-file/power-loss atomicity claim.
- **Offline fake provider:** deterministic in-process bounded events with no credential, network, filesystem, process, SDK, or fallback authority. Tool-shaped output remains untrusted proposal input, and cancellation stops only local generation.
- **Fixed verifier:** one immutable bundled module/hash launched through Electron `utilityProcess.fork` with empty arguments, trusted cwd, a fresh minimal environment, ignored stdin, bounded output/deadline, and cancellation. It is current-user code, not a terminal, repository/package script, shell, or security sandbox.
- **Read-only Git:** an exact `git.exe` identity and fixed status/diff forms with prompts, optional locks, lazy fetch, helpers, hooks, filters, text conversion, external diff, submodules, and protocols denied, plus before/after mutation snapshots. Hardening narrows the official Git path but does not contain a replaced or malicious current-user executable.

**Verification:** The first `npm run verify` hit the existing diagnostics subprocess test's 5-second timeout; no assertion failed. The focused diagnostics rerun passed 2/2, with its slow case completing in 596 ms. A clean full `npm run verify` then passed 40 unit, 42 integration, 5 component, and 18 active security tests. `npm run test:e2e` passed 5/5 exact Electron scenarios with zero retries. The initial timeout remains recorded rather than being hidden.

**Evidence:** `tasks/evidence/g2-threat-boundaries.md`.

**Preview:** `tasks/evidence/artifacts/phase-t0051-m2-threat-review.png`, SHA-256 `DBF0EDBDF14F0A719CD498F785F89803E8A3B09DDFF682C0ED88A941C4CFDC8D`. The fresh real-Electron capture is byte-identical to T0050 and visually unchanged because this was a documentation/security phase; the shell truthfully exposes no M2 capability.

**Git ownership:** No staging, commit, push, or remote mutation was performed. The user owns all Git operations.

**Next task:** T0052 only - write the RED hostile Windows workspace/path authorization suite before any production reader exists.

### 2026-08-11 - T0052 Windows workspace/path RED contract

**State:** T0052 is complete in the required RED state. It added a process-neutral contract and tests only; the production module `src/main/windows-workspace-authorizer.ts` is intentionally absent.

**Contract:** `src/shared/contracts/workspace.ts` defines schema version 1, a closed bounded denial-code union, serializable stable root/target identity fields, a main-owned root authority, a bounded UTF-8 snapshot, the authorizer port, and three deterministic race checkpoints. It exposes no filesystem handle, directory enumeration, write, process, Git, provider, credential, or renderer authority.

**Hostile test matrix:**

- `tests/unit/windows-workspace-path-policy.test.ts` covers valid local-drive/root-relative spellings and rejects malformed, relative, drive-relative, UNC, device, extended, parent, alternate-stream, reserved-name, trailing-dot/space, separator, and control forms.
- `tests/security/windows-workspace-authorizer.test.ts` covers missing/wrong-type/reparse roots; missing/directory/reparse-escape/hard-linked targets; case equivalence; root and target identity races; frozen serializable results; bounded UTF-8 bytes and lowercase SHA-256; and denial of open-handle exposure.
- Every fixture lives under a unique canonical OS temporary parent. Recursive cleanup revalidates that parent and prefix first; inspection found zero remaining `zenith-workspace-*` directories.

**Exact RED evidence:**

| Command                                                                                                    | Expected/actual result                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npx vitest run --project unit tests/unit/windows-workspace-path-policy.test.ts --reporter=verbose`        | Expected nonzero; exit 1, 2/2 tests failed with `ERR_MODULE_NOT_FOUND` for `windows-workspace-authorizer.ts` |
| `npx vitest run --project security tests/security/windows-workspace-authorizer.test.ts --reporter=verbose` | Expected nonzero; exit 1, 7/7 tests failed with the same `ERR_MODULE_NOT_FOUND`                              |

All nine failures have the intended single cause. There was no fixture, syntax, type, permission, assertion, or cleanup failure, and no stub weakened or skipped the contract. The complete `npm run verify` remains intentionally RED until T0053 supplies the missing authorizer.

**Green supporting gates:** Prettier write/check and `npm run format:check` passed; `npm run lint` passed with zero warnings; `npm run typecheck` passed both TypeScript projects; `git diff --check` passed; fixture cleanup reported zero leftovers; and `npm run test:e2e` passed 5/5 exact Electron scenarios with zero retries.

**Evidence:** `tasks/evidence/g2-workspace-path-red.md`.

**Preview:** `tasks/evidence/artifacts/phase-t0052-m2-path-red.png`, SHA-256 `DBF0EDBDF14F0A719CD498F785F89803E8A3B09DDFF682C0ED88A941C4CFDC8D`. The fresh real-Electron capture is byte-identical to T0051 and visually unchanged because RED contracts/tests add no product behavior; the shell still exposes no project filesystem authority.

**Authority and Git:** No production authorizer, filesystem read/write, IPC/preload/renderer workspace method, provider action, process runner, or Git reader was added. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0053 only - implement the minimum main-owned read-only Windows authorizer until these exact two unit and seven security tests turn GREEN.

### 2026-08-11 - T0053 main-only Windows authorizer GREEN

**State:** T0053 is complete. `src/main/windows-workspace-authorizer.ts` is the sole new production module for this slice, and the exact T0052 RED matrix is GREEN. The application does not instantiate or expose it.

**Implemented boundary and controls:**

- Authorizes one existing absolute drive-letter Windows directory after lexical denial, `lstat` inspection, direct link/junction rejection, native canonicalization, case-insensitive spelling comparison, and bigint filesystem identity capture.
- Derives a stable lowercase SHA-256 authority ID and keeps the frozen authority record in an authorizer-local `WeakMap`; copied, forged, and cross-authorizer records cannot act as authority.
- Accepts one exact relative target, revalidates the root, inspects every path component, rejects link/reparse traversal, requires canonical containment, denies hardlink ambiguity, and requires one regular file within the 1-byte to 4-MiB limit.
- Opens the target once for reading and compares opened-handle type, identity, link count, size, and time facts before the bounded read. It reads at most `max + 1` bytes, then rechecks the handle, target path/canonical identity, and root for detectable drift.
- Requires fatal UTF-8 decoding with no NUL and returns only a frozen snapshot with copied bytes, length, lowercase SHA-256, encoding, and serializable identity. It never returns the file handle or target path.
- Does not claim Node `O_NOFOLLOW` as a proven Windows control. Component, realpath, opened-handle, bounded-read, and post-read checks form the tested boundary; same-user races remain a documented residual risk and detected ambiguity fails closed.
- Contains no write, directory enumeration, process, Git, provider, credential, preload, or renderer authority.

**GREEN test expansion:** The original lexical unit suite passed 2/2 and the original hostile filesystem security suite passed 7/7. T0053 added 3/3 hostile limits, authority-forgery, and opened-handle mutation cases plus 1/1 static unprivileged-process boundary check. The added cases cover oversize input, malformed UTF-8, NUL text, cross-authorizer reuse, and mutation after opening; the static check proves Node filesystem imports remain main-only, no filesystem mutation primitive exists, and the module is absent from preload, application API, and renderer source.

**Verification:** `npm run verify` passed 42 unit, 42 integration, 5 component, and 29 active security tests; the one packaged-security case remains intentionally skipped outside package verification. `npm run test:e2e` passed 5/5 exact Electron scenarios with zero retries. `git diff --check` passed, fixture inspection found zero `zenith-workspace-*` leftovers, and no flaky retry or test weakening was required.

**Evidence:** `tasks/evidence/g2-workspace-path-green.md`.

**Preview:** `tasks/evidence/artifacts/phase-t0053-m2-path-green.png`, SHA-256 `DBF0EDBDF14F0A719CD498F785F89803E8A3B09DDFF682C0ED88A941C4CFDC8D`. The fresh real-Electron capture is byte-identical to T0052 and visually unchanged because the main-only service is deliberately unreachable from the current preload/renderer shell.

**Application authority and Git:** The authorizer is not instantiated. There is no folder picker, workspace IPC, preload method, renderer file display, directory enumeration, write, provider action, process/Git invocation, or later-gate authority. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0054 only - write RED controlled workspace open/read service, sender-owned IPC, frozen preload, and renderer-safe snapshot tests before exposing the authorizer to the application.

### 2026-08-11 - T0054 controlled workspace application seam RED

**State:** T0054 is complete in the required RED state. Four focused test files define the smallest renderer-reachable controlled workspace seam, but no production workspace service, IPC operation, preload method, client, or UI action was added.

**Frozen contract:**

- `workspace.openControlled` accepts only `null`, so the future main process owns selection and the renderer cannot supply a raw path.
- `workspace.readTextFile` accepts exactly a workspace ID, monotonic access-trust version, and one relative path; `workspace.close` accepts exactly the workspace ID and trust version.
- Success parsing exposes only display name, relative path, decoded text, byte count, digest, encoding, and access/configuration trust states. Raw roots, canonical path facts, handles, filesystem identities, and byte arrays are rejected.
- The future main service must bind each session to its IPC owner, workspace ID, and access-trust version. Wrong-owner, wrong-workspace, stale-trust, extra-field, and closed-session requests fail closed.
- Cancellation is checked before selection and after asynchronous reads, preventing late results from being returned.
- The future preload surface is limited to frozen `openControlled`, `readTextFile`, and `close` methods, with no generic filesystem, directory, raw-path, or write method.
- The renderer contract requires an explicit `Open controlled workspace` action, a path-free recoverable error/retry state, one safe file preview, and visible access/configuration trust.

**Exact RED matrix:**

| Test file/command                                                                                                                                          | Expected/actual result                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run --project unit tests/unit/workspace-ipc-contract.test.ts --reporter=verbose`                                                               | Expected nonzero; 3/3 failed only because workspace IPC request/success operations are unsupported                                                                            |
| `npx vitest run --project integration tests/integration/workspace-read-service.test.ts tests/integration/workspace-preload-api.test.ts --reporter=verbose` | Expected nonzero; 3/3 service cases failed only because `workspace-read-service.ts` is missing, and 2/2 preload cases failed only because the workspace API/client is missing |
| `npx vitest run --project component tests/component/workspace-pane.test.tsx --reporter=verbose`                                                            | Expected nonzero; 2/2 failed only because `Open controlled workspace` is not rendered                                                                                         |

All ten failures occur at the intended absent seams. There was no fixture, syntax, type, permission, cleanup, or unrelated assertion failure, and no stub, skip, or weakened test. The complete `npm run verify` remains intentionally RED until T0055 implements this exact seam.

**Green supporting gates:** Prettier write/check, `npm run format:check`, `npm run lint` with zero warnings, both TypeScript projects under `npm run typecheck`, and `git diff --check` passed. `npm run test:e2e` passed 5/5 exact Electron scenarios with zero retries.

**Evidence:** `tasks/evidence/g2-workspace-service-red.md`.

**Preview:** `tasks/evidence/artifacts/phase-t0054-m2-workspace-red.png`, SHA-256 `DBF0EDBDF14F0A719CD498F785F89803E8A3B09DDFF682C0ED88A941C4CFDC8D`. The fresh capture was visually inspected and is byte-identical to T0053 because T0054 adds tests only. The real Electron shell still shows `No folder open` and exposes no project filesystem authority.

**Authority and Git:** T0054 added no production capability. The T0053 main-only authorizer remains uninstantiated and unreachable from IPC, preload, and renderer code. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0055 only - implement the controlled one-root/one-file open/read/close slice until the exact three unit, five integration, and two component RED checks turn GREEN.

### 2026-08-11 - T0055 controlled workspace application slice GREEN

**State:** T0055 is complete. The exact T0054 matrix is GREEN through schema-version-1 workspace open/read/close IPC, a new main-owned workspace-read service, Electron's main-owned one-file chooser, the T0053 Windows authorizer, a frozen three-method preload API, and an accessible renderer preview/retry/close flow.

**Implemented authority boundary:**

- Electron main owns file selection. The renderer sends no root or selected absolute path; main derives the parent root and exact selected relative filename and passes them directly to the T0053 authorizer.
- The workspace service binds its main-only session to IPC owner, workspace ID, and monotonic access-trust version. It permits only the exact selected relative file, so sibling-file reads are denied.
- Wrong owner, wrong workspace, stale trust, extra data, and closed sessions fail closed. Cancellation is checked before selection and after each awaited authorization/read step; late results are discarded.
- Renderer-visible results contain only display name, selected relative path, decoded text, byte count, digest, encoding, and access/configuration trust states. No raw root, canonical path, filesystem handle, identity record, or `Uint8Array` crosses the boundary.
- Configuration remains visibly inert. No workspace content is executed or interpreted as application configuration.
- `close` and owner invalidation delete the main-owned session. The only file handle exists inside the authorizer's bounded read and is closed there; the service retains none.
- The UI covers accessible idle, opening, denied/retry, preview, trust, and close states. Component checks verify focus after open, retry, and close plus complete context removal on close.

**Verification:** The T0054 contract passed 3/3 unit tests; service and preload behavior passed 5/5 integration tests; renderer behavior passed 2/2 component tests. The full `npm run verify` gate passed 45 unit, 47 integration, 7 component, and 29 active security tests, with one packaged-security case intentionally skipped by source-gate policy. `npm run test:e2e` passed 5/5 exact Electron scenarios with zero retries.

**Exact Electron proof:** The E2E test replaces only Electron's native dialog method inside the test process, selects a temporary `zenith-g2.md` UTF-8 fixture, clicks the real renderer control, verifies the constrained preview and absence of the raw path, then restarts and verifies the workspace is closed. Product code contains no test hook, injected path, or environment backdoor.

**Evidence:** `tasks/evidence/g2-workspace-service-green.md`.

**Preview:** `tasks/evidence/artifacts/phase-t0055-m2-workspace-green.png`, 1800x1125, SHA-256 `4C147D1C335A473EBF5890E8A0CD5CE7DB10E2D645859E7541F94451FD096FF3`. The fresh image was visually inspected and shows the selected relative file, decoded content, byte count, UTF-8 marker, digest prefix, trusted access, inert configuration, and explicit close control without exposing the temporary root.

**Cleanup caveat:** The latest E2E runtime cleaned its own fixture. One unrelated stale OS-temporary directory, `zenith-e2e-WP9qDv`, from an earlier 19:55 run remains. Validated deletion was blocked by the environment, so it was deliberately left untouched and is not claimed as a T0055 artifact.

**Exclusions and Git:** No package build occurred. T0055 adds no directory tree, arbitrary sibling read, production write, edit proposal/journal, provider, process, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0056 only - prove hostile path, cancellation, drift, restart, revocation/session clearing, renderer non-retention, and exact one-file exposure in a dedicated real-Electron denial matrix.

### 2026-08-11 - T0056 exact-Electron workspace denial and restart proof

**State:** T0056 is complete and closes the M2.1 workspace/path package. The controlled one-file boundary is now proven in Electron 43.3.0 with the same production trust adapter used by the application.

**Durable access trust:** The new main-only `workspace-access-trust.ts` derives the existing M1 workspace identity from the T0053 canonical authority, initializes the persistent trust service, persists an access grant only after explicit user selection, restores trusted or revoked state and versions from SQLite, and authorizes each read against the active version. Configuration trust is never granted and remains inert. No controller or identity is exposed to the renderer.

**Workspace audit:** Schema-version-1 audit now allowlists only `workspace.open`, `workspace.read`, and `workspace.close` actions in the `workspace` category. Structural selection retains action/outcome/correlation/request/run/code fields while discarding paths, file content, content hashes, and attacker extras without traversing them.

**Dedicated exact-Electron matrix:**

- A safe selected UTF-8 file succeeds with configuration inert and no raw root, canonical facts, handle, identity, or byte array exposed.
- A sibling read is denied with `WORKSPACE_SESSION_DENIED`; parent traversal is rejected with `WORKSPACE_REQUEST_INVALID` before filesystem authority.
- Binary content is denied with `WORKSPACE_FILE_NOT_TEXT`; a 1 MiB + 1 byte target is denied with `WORKSPACE_FILE_TOO_LARGE`.
- Abort at the deterministic `target-opened` checkpoint returns `WORKSPACE_CANCELLED`, and late content is not exposed.
- Mutation after the handle opens returns `WORKSPACE_TARGET_DRIFT`; the test fixture restores its original content.
- Explicit selection creates trusted access version 2, which restores through a new SQLite/local-state service. Revocation denies the live session and restores as revoked version 3 after the next restart.
- Requested/succeeded open audit events preserve exact correlation, request, and run IDs while redacting path, content, and digest.
- Fixture and product sources provide no child-process, network/provider, Git, directory-enumeration, or write executor authority.

The focused compiled main-process matrix passed twice with zero retries after production integration. Each run used a validated `zenith-workspace-matrix-*` temporary root; post-run matrix leftovers were zero.

**Verification:** `npm run verify` passed 48 unit, 47 integration, 7 component, and 29 active security tests, with one packaged-security case intentionally skipped by source policy. The full `npm run test:e2e` suite passed 6/6 exact Electron scenarios with zero retries. `git diff --check` passed.

**Application non-retention proof:** The real app E2E opens the temporary `zenith-g2.md` through the test-process-only dialog replacement, closes it through the production IPC method, and confirms the preview/content disappear from the DOM; neither full temporary path nor content appears in localStorage or sessionStorage; and restart returns to `Open controlled workspace` with no preview. Durable audit counts progress from 11 while open to 13 after close, 14 after restart recovery, and 16 after the later credential revocation, with no renderer console/page error.

**Evidence:** `tasks/evidence/g2-workspace-exact-electron-proof.md`.

**Preview:** `tasks/evidence/artifacts/phase-t0056-m2-workspace-proof.png`, 1800x1125, SHA-256 `7295F63F0C787E0E55B4A914CA75300C4BB2E7D9DD50DDA3247D60F3287F8447`. The fresh image was visually inspected and shows the selected relative file/content, trusted access, inert configuration, explicit close control, and `Local audit · 11 events` without a raw path.

**Cleanup caveat:** The unrelated stale `zenith-e2e-WP9qDv` directory from the earlier 19:55 run remains untouched because deletion was blocked. It belongs to neither T0056 matrix run nor its evidence.

**Exclusions and Git:** No package build, production write/mutation authority, provider/network adapter, process runner, Git reader, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice capability was added. The matrix's deterministic mutation exists only to prove the production reader denies drift. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0057 only - write RED process-neutral offline-provider event, validation, deterministic-seed, abort, late-event, and hard network-denial tests before any provider implementation exists.

### 2026-08-11 - T0057 offline fake-provider contract RED

**State:** T0057 is complete in the required RED state. `src/shared/contracts/offline-provider.ts` defines a GREEN process-neutral schema-version-1 contract, while `src/main/offline-fake-provider.ts` is intentionally absent.

**Frozen request/event boundary:**

- The only identity is provider `zenith.offline.fake`, model `deterministic-v1`, and endpoint class `offline`.
- A request contains one 1-4096 character instruction, one selected bounded UTF-8 file of at most 1 MiB with matching byte length and lowercase content SHA-256, and a lowercase deterministic seed SHA-256.
- Windows relative-path validation is reused and normalized at the provider-contract boundary.
- `allowedTools` must contain exactly `file.edit.propose`; shell, arbitrary tools, and extra authority are rejected.
- Explicit budgets allow 5-64 events and 1-65,536 output characters.
- The future provider sequence is exactly `started`, `delta`, `tool-proposal`, `usage`, `completed` with monotonic sequence numbers. The proposal retains the selected relative path and expected base digest but cannot apply a write.
- Abort before iteration or during emission must stop without a late event. Static and runtime checks deny network, DNS, web streams, provider SDKs, credentials, environment access, endpoints, and `fetch`.

**Focused RED/GREEN results:**

| Command                                                                                                   | Expected/actual result                                                                                |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npx vitest run --project unit tests/unit/offline-provider-contract.test.ts --reporter=verbose`           | Expected zero; 10/10 contract checks passed                                                           |
| `npx vitest run --project integration tests/integration/offline-fake-provider.test.ts --reporter=verbose` | Expected nonzero; 3/3 failed only with `ERR_MODULE_NOT_FOUND` for `src/main/offline-fake-provider.ts` |
| `npx vitest run --project security tests/security/offline-provider-network.test.ts --reporter=verbose`    | Expected nonzero; 1/1 failed only with `ENOENT` for the same absent module                            |

There was no unrelated fixture, syntax, type, permission, assertion, or cleanup failure, and no test was weakened, skipped, or satisfied with a stub.

**Complete baseline:** Dependency policy, Prettier/format, lint with zero warnings, strict type checking, and all 58 unit tests are GREEN. Integration has 47 passing checks plus the 3 intended missing-module RED checks; component is 7/7 GREEN; security has 29 passing checks, 1 intended missing-file RED check, and 1 packaged check skipped by source policy. The complete `npm run verify` is intentionally RED until T0058. `npm run test:e2e` remains GREEN at 6/6 exact Electron scenarios with zero retries, and `git diff --check` passed.

**Evidence:** `tasks/evidence/g2-offline-provider-red.md`, SHA-256 `781C216E07E55CE685E81C406E39CBEA26950A169C665F4E804D8BF8744CC6BB`.

**Preview:** `tasks/evidence/artifacts/phase-t0057-m2-provider-red.png`, 1800x1125, SHA-256 `7295F63F0C787E0E55B4A914CA75300C4BB2E7D9DD50DDA3247D60F3287F8447`. The fresh real-Electron screenshot was visually inspected and is byte-identical to T0056 because this RED phase adds no renderer behavior.

**Exclusions and Git:** No provider implementation, model call, network/DNS access, SDK, credential use, endpoint configuration, proposal apply, filesystem write, provider IPC/renderer control, process runner, Git action, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice capability was added. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0058 only - implement the deterministic offline fake provider until this exact event, validation, deterministic-seed, abort/late-event, and hard-egress matrix turns GREEN.

### 2026-08-11 - T0058 deterministic offline fake provider GREEN

**State:** T0058 is complete and GREEN. It adds only `src/main/offline-fake-provider.ts` plus shared-contract and test hardening. The provider is not connected to IPC, preload, renderer, a run service, or file writes.

**Implemented provider boundary:**

- `createOfflineFakeProvider()` returns a frozen object exposing only `stream(request, signal)`.
- The visible identity is provider `zenith.offline.fake`, model `deterministic-v1`, and endpoint class `offline`.
- Identical validated request/seed input produces the same frozen, monotonic event sequence: `started`, `delta`, `tool-proposal`, `usage`, `completed`.
- The nested provider, tool, arguments, and usage objects are frozen. The sole inert `file.edit.propose` proposal is bound to the selected relative path and expected base SHA-256, with no callback, host object, or apply authority.
- Usage records bounded input bytes, output characters, and exact event count. The complete serialized event sequence must fit strictly within the caller's declared output budget before the first event is emitted.
- Invalid input, cancellation, and insufficient budget become fixed redacted `OFFLINE_PROVIDER_INVALID_REQUEST`, `OFFLINE_PROVIDER_CANCELLED`, and `OFFLINE_PROVIDER_BUDGET_EXCEEDED` results without echoing input, signal reason, or hidden state.
- The abort signal is checked before every emission, so cancellation before or during iteration produces no late event.
- Accessor-backed tool lists are rejected without invoking the accessor.
- The implementation imports only the shared contract and has no network, DNS, provider SDK, endpoint, secret, filesystem, IPC, renderer, subprocess, or fallback authority.

**Focused GREEN matrix:** The contract suite passed 11/11; the fake-provider integration suite passed 4/4; and the hard-egress security suite passed 1/1 with `fetch` trapped and unused.

**Complete verification:** `npm run verify` is GREEN with 59 unit, 51 integration, 7 component, and 30 active security tests passed; one packaged-security check remains skipped outside its package phase. Dependency preflight found 29 exact direct dependencies with lifecycle scripts disabled; format, lint, and both TypeScript projects passed. `npm run test:e2e` passed 6/6 exact Electron scenarios with zero retries, and `git diff --check` passed.

**Evidence:** `tasks/evidence/g2-offline-provider-green.md`, SHA-256 `E8DA59B68601BA09E1421C99C56244F30625724CE6EC700453B88E56CBD613A9`.

**Preview:** `tasks/evidence/artifacts/phase-t0058-m2-provider-green.png`, 1800x1125, SHA-256 `7295F63F0C787E0E55B4A914CA75300C4BB2E7D9DD50DDA3247D60F3287F8447`. The fresh real-Electron image was visually inspected and is byte-identical to T0057 because the provider has no application connection; the UI truthfully shows no provider connected and no active run.

**Exclusions and Git:** The fake cannot read a credential, open a destination, create a run manifest, expose provider IPC/renderer controls, or apply its proposal. No real provider, network/DNS, SDK, filesystem write, process runner, Git action, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0059 only - freeze the minimal pre-send run-manifest compiler and presentation contract in RED before connecting the fake provider to the application.

### 2026-08-11 - T0059 offline run-manifest boundary RED

**State:** T0059 is complete in the required RED state. It adds tests only; the shared manifest contract, main compiler/run connection, application API, preload surface, and renderer presentation are intentionally absent.

**Frozen manifest review boundary:**

- Schema version 1 has kind `offline.run-manifest` and a deterministic lowercase SHA-256 digest binding all material fields.
- The master is fixed to ID `zenith.master.local`, label `Zenith`, and role `local-policy-owner`.
- The destination is fixed to provider `zenith.offline.fake`, model `deterministic-v1`, and endpoint class `offline`; callers cannot supply, hide, or change it.
- The deterministic seed and objective are visible and digest-bound because either can change the provider result.
- Workspace context exposes only workspace ID, current access-trust version, and inert configuration-trust version.
- Selected context exposes only relative path, UTF-8 marker, byte count, and lowercase content SHA-256; the file body is excluded.
- Event/output budgets come from the validated provider request. The sole tool schema is `file.edit.propose` with `proposal-only` effect and an explicitly untrusted replacement-text argument.
- Omissions explicitly list raw workspace path, unselected files, workspace configuration, and credentials/secrets.
- Policy states that offline provider execution needs no approval, tool output is inert, and any later file mutation requires an exact single-use approval.
- The review UI must show destination, seed, selected metadata, budget, tool, omissions, approval policy, and owner-bound cancellation before any run.

**Required denials:** stale access-trust version or selected-file digest; any unselected file; oversize context; unknown tool or field; hidden/caller-supplied destination; malformed endpoint, model, seed, omissions, or policy; unchanged digest after objective/seed drift; retained raw body, path, configuration, unselected content, or secret; path-bearing error; and a late manifest retained after workspace close.

**Exact RED matrix:**

| Command                                                                                                    | Expected/actual result                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npx vitest run --project unit tests/unit/offline-run-manifest-contract.test.ts --reporter=verbose`        | Expected nonzero; 10/10 failed only with `ERR_MODULE_NOT_FOUND` for `src/shared/contracts/run-manifest.ts` |
| `npx vitest run --project integration tests/integration/offline-run-manifest.test.ts --reporter=verbose`   | Expected nonzero; 4/4 failed only with `ERR_MODULE_NOT_FOUND` for `src/main/offline-run-manifest.ts`       |
| `npx vitest run --project component tests/component/offline-run-manifest-pane.test.tsx --reporter=verbose` | Expected nonzero; 2/2 failed only because `Review offline run manifest` is absent                          |

All sixteen new checks fail only at the intended missing seams. No unrelated fixture, syntax, type, permission, assertion, or cleanup failure occurred, and no test was weakened, skipped, or satisfied with a stub.

**Complete baseline:** Dependency policy, formatting, lint, and both strict TypeScript projects are GREEN. Existing checks remain GREEN at 59 unit, 51 integration, 7 component, and 30 active security tests, with one packaged-security case skipped outside its package phase. `npm run verify` is intentionally RED only when it reaches the ten new missing-contract unit checks. `npm run test:e2e` remains GREEN at 6/6 exact Electron scenarios with zero retries, and `git diff --check` passed.

**Evidence:** `tasks/evidence/g2-run-manifest-red.md`, SHA-256 `7D0B58AE72D5A2FD038E7A2608799913D4F4719E1BA6E7D67A2AD427FBF1F645`.

**Preview:** `tasks/evidence/artifacts/phase-t0059-m2-manifest-red.png`, 1800x1125, SHA-256 `7295F63F0C787E0E55B4A914CA75300C4BB2E7D9DD50DDA3247D60F3287F8447`. The fresh real-Electron screenshot was visually inspected and is byte-identical to T0058 because tests add no renderer behavior; the app still truthfully shows no provider connection or active run.

**Exclusions and Git:** No production manifest parser/compiler, run service, application API/IPC/preload method, review UI, fake-provider invocation, proposal apply, filesystem write, network, process, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0060 only - implement and display the immutable owner/workspace/trust/file-bound offline pre-send manifest until the exact contract, compiler, denial, cancellation, and accessibility matrix turns GREEN.

### 2026-08-11 - T0060 immutable offline run manifest GREEN

**State:** T0060 is complete and GREEN. After one authorized file is open, the renderer can request a review-only manifest preview. The fake provider remains stopped, and no proposal, approval, or write is created.

**Implemented manifest boundary:**

- `src/shared/contracts/run-manifest.ts` defines strict schema-version-1 process-neutral preview and manifest values, fixed identities, bounded fields, explicit omissions, a closed one-tool set, and deep-frozen parsed data.
- `src/main/offline-run-manifest.ts` compiles a canonical projection and lowercase SHA-256 digest. Objective or seed drift changes the digest; caller-supplied master, provider, model, tool, policy, omission, or destination authority is rejected.
- The fixed master remains `zenith.master.local` / `Zenith` / `local-policy-owner`; the fixed destination remains `zenith.offline.fake` / `deterministic-v1` / `offline`.
- The metadata-only main service revalidates the IPC owner, workspace identity, active access-trust version, exact selected relative file, current bytes, and current content digest before compilation. Wrong owner/workspace/version/target or stale identity denies.
- Strict sender-owned IPC and a frozen one-method preload surface expose only `run.previewOfflineManifest`.
- The accessible renderer flow provides `Review`, `Retry`, `Back`, and `Close`, suppresses late results after cancellation or context change, and truthfully labels the view `REVIEW ONLY / PROVIDER NOT STARTED`.
- The manifest shows the fixed master/destination, deterministic seed, objective, selected relative filename/hash/size/UTF-8 marker, budgets, sole proposal-only tool, omissions, approval policy, and cancellation ownership.
- Selected file body, raw workspace path, unselected files, workspace configuration, credentials, filesystem handles, and executable authority are neither displayed nor retained.
- `createOfflineProviderRequest` can derive the exact validated provider request from the manifest, but no application path invokes it or streams provider events in T0060.

**Focused GREEN matrix:** 10/10 manifest-contract tests, 2/2 IPC-contract tests, 4/4 compiler tests, 3/3 metadata-only service tests, and 2/2 component/accessibility tests passed.

**Complete verification:** `npm run verify` passed 71 unit, 58 integration, 9 component, and 30 active security tests; one packaged-security check remains skipped outside its package phase. The final exact-Electron suite passed 6/6 with zero retries. Post-documentation format, lint, both-TypeScript-project typecheck, and `git diff --check` gates were GREEN.

**Honest E2E correction:** The first exact-Electron attempt found an ambiguous text selector because `Offline` appears in multiple truthful labels. The test selector was narrowed to an exact accessible match; no product behavior changed to hide the ambiguity. The fresh complete rerun then passed 6/6 with zero retries.

**Evidence:** `tasks/evidence/g2-run-manifest-green.md`, final SHA-256 `D70C5D3450847358F3A4B96ABA285FA0966F76B668B14565161CF6D0881F7D0F`.

**Preview:** `tasks/evidence/artifacts/phase-t0060-m2-manifest-green.png`, 1800x1125, SHA-256 `10C887C7EA745C5684C54B1DF055AB55F56902806674E979F1E8868C95993DDE`. The fresh image was visually inspected and shows the compact manifest review, inactive provider/run labels, and no selected-file body.

**Exclusions and Git:** No provider invocation, network/DNS, credential read, file-proposal conversion, approval capability, file mutation, process execution, Git action, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. Cancellation remains bound to the current renderer-owned request generation. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0061 only - freeze the canonical one-file edit proposal and diff contract in RED while proving proposal creation cannot mutate the selected file.

### 2026-08-12 - T0061 canonical one-file proposal/diff RED

**State:** T0061 is complete in the required RED state. Tests and disk-mutation canaries freeze the schema-version-1 proposal boundary; `src/shared/contracts/file-edit-proposal.ts` is intentionally absent.

**Frozen proposal and diff contract:**

- Kind `file.edit.proposal` is compiled only from `file.edit.proposal.compile` input and becomes a deeply immutable process-neutral value.
- It binds the exact reviewed manifest SHA-256, workspace ID, access-trust version, selected Windows-relative target, original UTF-8 byte length/content SHA-256, replacement bytes/hash/size, fixed policy/executor, deterministic diff, and proposal digest.
- Selected LF or CRLF convention is preserved. Provider LF replacement text is normalized to the selected file's CRLF convention when needed; LF remains LF. Mixed original line endings, invalid UTF-8, and NUL are denied.
- The fixed policy is `single-file-text-v1` version 1 with selected-file-only scope and no mutation before approval. The fixed executor is `main.workspace-file.apply`.
- Replacement bytes are bounded to 1 MiB; the independent `unified-v1` diff is bounded to 256 KiB and uses deterministic `a/` and `b/` slash paths with exact old/new lines.
- Recovery expectation is fixed to `journaled-single-file-v1` / `replace-or-explicit-recovery`.
- The shared implementation must remain process-neutral: no Node/Electron import, `Buffer`, `process`, network API, filesystem/process primitive, host object, or callback.

**Required denials:** no-op after EOL normalization; target, base bytes/hash, replacement hash, policy version, executor, proposal digest, or manifest binding drift; invalid UTF-8, NUL, mixed EOL, oversize replacement/diff, malformed diff header/content, unknown/extra fields, and duplicate JSON fields.

**Focused RED results:** The unit suite is 11/11 RED only with `ERR_MODULE_NOT_FOUND` for `src/shared/contracts/file-edit-proposal.ts`. The security suite is 3/3 RED for the same intended absence: one source check reports `ENOENT`, and two imports report `ERR_MODULE_NOT_FOUND`. Both mutation-canary cases re-read their temporary target in `finally` and confirm byte-identical content. Validated cleanup found zero `zenith-file-proposal-*` leftovers.

**Baseline and intentional gate state:** Serial baselines remain GREEN at 71 unit, 58 integration, 9 component, and 30 active security tests, with one packaged-security case skipped outside its package phase. `npm run verify` is intentionally RED only at the 11 new proposal-contract unit checks after 71 existing unit checks pass. Exact Electron remains GREEN at 6/6 scenarios with zero retries.

**Honest concurrency note:** An initial attempt to run the existing Vitest baselines concurrently caused only the existing diagnostics subprocess test to exceed its five-second timeout under resource contention. The unchanged unit baseline was rerun serially and passed 71/71 in 1.85 seconds. No product code, test assertion, or timeout was changed.

**Evidence:** `tasks/evidence/g2-file-edit-proposal-red.md`, final SHA-256 `AF278339362A92A8AC16D9648AE275CB9A756FF727E55058B3FCA356FD3D12BC`.

**Preview:** `tasks/evidence/artifacts/phase-t0061-m2-proposal-red.png`, 1800x1125, SHA-256 `93A2491FB58301BF3447EA85635FA937BE1DE7F0B5E711BEA6335B4AF1375F13`. The fresh real-Electron image was visually inspected and is intentionally unchanged from T0060: the app remains at `REVIEW ONLY / PROVIDER NOT STARTED` because T0061 adds tests only.

**Static validation:** Dependency preflight, format, lint with zero warnings, both strict TypeScript projects, and `git diff --check` were GREEN after documentation synchronization.

**Exclusions and Git:** No production proposal contract/compiler, provider invocation, approval capability, file executor, diff UI, mutation, recovery journal, network/DNS, credential read, process, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0062 only - generalize the existing approval broker for an exact one-file edit capability while leaving proposal creation and visible diff implementation to T0063.

### 2026-08-12 - T0062 exact file-approval capability GREEN

**State:** T0062 is complete and GREEN within its closed main-only scope. The application still cannot issue a file capability because the T0061 proposal compiler, diff UI, executor registration, and public approval route remain absent.

**Closed operation/executor vocabulary:**

- The only versioned action/executor pairs are `preference.set` / `main.preference` version 1 and `workspace.file.apply` / `main.workspace-file.apply` version 1.
- The shared schema-version-1 approval proposal parser now has strict cross-field handling for the file action. File arguments contain only proposal SHA-256, selected Windows-relative path, base-content SHA-256, and result-content SHA-256.
- File actions require workspace scope, one `workspace-file` target exactly equal to the canonical relative argument path, and the fixed file executor. Preference actions retain application scope and the fixed preference executor.
- Absolute, traversal, forward-slash, reserved-device, trailing-dot/space, NUL, duplicate-target, extra-field, base/result no-op, unsupported operation/executor, hostile path, and mismatched action/executor/scope combinations fail closed. No generic executor or renderer-selected callback exists.

**Ephemeral capability boundary:**

- The main broker upgrades its frozen ephemeral capability to schema version 2 while preserving the existing canonical schema-version-1 preference proposal/digest.
- A file capability binds the canonical approval digest, nonce, request/proposal IDs, owner, run, workspace, access- and configuration-trust versions, reviewed context/manifest digest, policy digest/version, exact file-proposal digest, base/result hashes, fixed executor/version, issue time, and 30-second expiry.
- Candidate capability equality and a fresh canonical digest of the current proposal are rechecked before consumption. Capability/proposal drift, wrong owner/run/executor/policy, replay, cancellation, expiry, direct revocation, owner revocation, run revocation, and global invalidation deny before effect.
- Consumption is single-winner and main-only. State becomes `consumed` immediately before the supplied main-owned effect callback.
- The existing preference service explicitly narrows the approved union back to `preference.set`, keeping its harmless behavior unchanged.

**Focused RED-to-GREEN history:** Before implementation, all 3 new unit checks stopped at the preference-only parser. Two of 3 security checks stopped at that same boundary, while the third hostile-input case was already denied by the old closed parser. Final focused results are 3/3 new unit and 4/4 new security, plus 8/8 existing approval unit/canonicalization, 4/4 existing approval security/boundary, and 2/2 preference-service integration tests.

**Regression state:** The serial regression excluding T0061's deliberately absent contract is GREEN at 74 unit, 58 integration, 9 component, and 34 active security tests, with one packaged-security check skipped outside its package phase. Exact Electron remains GREEN at 6/6 with zero retries. Overall `npm run verify` is intentionally RED only at T0061's 11 missing proposal-contract checks after 74 existing/current unit checks pass; T0062's own production and regression scope is GREEN.

**Evidence:** `tasks/evidence/g2-file-edit-approval-green.md`, final SHA-256 `2E8AD652393244F6366245327158FCAD805693DD1294481FFE85EE113FBBA6FE`.

**Preview:** `tasks/evidence/artifacts/phase-t0062-m2-file-approval-green.png`, 1800x1125, SHA-256 `D8ABD7760174AEF06AF2BD1ED60C7E1D7962D21638629CD8B8937CD60A0BF1CA`. The fresh real-Electron image was visually inspected and is intentionally unchanged: this phase changes a main-only policy boundary while the UI remains at manifest review with the provider stopped and no pending approval.

**Static validation:** Dependency preflight, formatting, lint with zero warnings, both strict TypeScript projects, and `git diff --check` were GREEN after documentation synchronization.

**Exclusions and Git:** There is no app IPC/preload/renderer file-capability route, proposal compiler, provider invocation, diff UI, approval prompt, file executor registration, workspace write, journal, network/DNS, credential read, process, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0063 only - implement the canonical file proposal, convert the fake provider's inert tool data after fresh selected-file revalidation, and display an accessible Approve/Reject diff without writing the workspace.

### 2026-08-12 - T0063 one-file proposal/diff review GREEN

**State:** T0063 is complete and GREEN. The T0061 process-neutral contract now exists, one narrow main service converts the fixed fake's inert output into review data, and the workspace remains byte-identical because no capability or write path is reachable.

**Proposal contract and verification:**

- `src/shared/contracts/file-edit-proposal.ts` provides strict schema-version-1 compile, parse, duplicate-JSON-field rejection, and independent verification without Node, Electron, filesystem, network, process, callback, or host authority.
- The immutable proposal binds reviewed manifest, workspace/access-trust version, canonical selected relative target, original bytes/hash/encoding/EOL, normalized replacement bytes/hash/EOL, fixed `single-file-text-v1` policy, fixed `main.workspace-file.apply` executor, bounded deterministic `unified-v1` diff, proposal digest, and `journaled-single-file-v1` recovery expectation.
- Invalid UTF-8, NUL, mixed EOL, no-op, oversize replacement/diff, malformed/duplicate/extra input, and target/base/result/policy/executor/digest drift fail closed.

**Main-only proposal service:**

- `src/main/offline-file-proposal-service.ts` accepts only the strict manifest plus optional replacement text.
- It freshly reauthorizes the exact selected-file snapshot before and after the fixed offline stream, enforces the ordered five-event sequence and sole `file.edit.propose` tool, then returns deeply frozen review data.
- Strict correlated IPC and a frozen one-method preload route expose preview only: no generic provider, filesystem, apply, executor, credential, network, or subprocess primitive.
- Filesystem canaries and exact-Electron rejection prove byte-identical selected-file contents throughout the flow.

**Accessible review UI:** The pane shows target, base/result hashes, risk, recovery expectation, exact red/green diff, and replacement text. Editing followed by `Rebuild` creates a new proposal digest. `Approve Review` is explicitly inert and reports that apply is unavailable and no capability was issued. `Reject`, cancellation, close, provider failure, and detected file drift preserve the workspace.

**Focused GREEN matrix:** proposal contract 11/11, proposal IPC contract 2/2, service integration 4/4, combined proposal/service security 5/5, and component/accessibility 3/3 passed.

**Complete verification:** `npm run verify` passed 87 unit, 62 integration, 12 component, and 39 active security tests; one packaged-security check remains skipped outside its package phase. Exact Electron passed 6/6 with zero retries.

**Honest selector corrections:** Component tests initially found target and status text repeated across honest accessible regions; selectors were narrowed to their owning regions only. The first focused Electron assertion similarly matched the target in header, summary, and diff; it was narrowed to the Target summary. No product behavior changed.

**Evidence:** `tasks/evidence/g2-file-edit-proposal-green.md`, recomputed final SHA-256 `D832FF103D7B121FE440B1130863EB715BE7F001BD256D84BEFD94924E7D8817` after removal of trailing Markdown breaks.

**Preview:** `tasks/evidence/artifacts/phase-t0063-m2-proposal-green.png`, 1800x1125, SHA-256 `3E61C6E3B9BE100793C2500CC73CE81DBEC2E64534193F781742D3318289BB36`. The fresh image was visually inspected and shows selected target/identities, risk, recovery, exact diff, replacement editor, inert decision controls, zero pending approvals, and no mutation state.

**Exclusions and Git:** No file capability is issued through the app. No executor registration, journal, write, rename, replace, rollback, startup recovery, network/DNS, credential read, process, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0064 only - freeze the durable one-file journal, conflict, crash-boundary, rollback, recovery, retention, and idempotence requirements in RED tests before any mutation implementation exists.

### 2026-08-12 - T0064 durable apply journal/recovery RED

**State:** T0064 is complete in the required RED state. It adds tests only and no production mutation authority. The three intentionally absent seams are `src/shared/contracts/file-apply-journal.ts`, `src/main/file-apply-journal-store.ts`, and `src/main/journaled-file-apply-executor.ts`.

**Frozen journal state and identity:**

- Schema version 1 has exactly seven states: `prepared`, `ready`, `applying`, `committed`, `conflict`, `recovery-required`, and `rolled-back`.
- The success path is monotonic: `prepared -> ready -> applying -> committed`. Conflict/recovery/rollback are explicit terminal outcomes; skipped, backward, terminal replay, stale compare-and-swap, non-monotonic time, and malformed transitions deny.
- Every immutable record binds proposal, approval proposal, capability digest, workspace/root/trust identity, exact target identity/relative path, base/result hashes and lengths, encoding/EOL, fixed artifact identities, recovery strategy, timestamp/sequence, bounded sanitized error, and canonical record digest.
- Records exclude capability nonce, replacement/base content, raw absolute path, credential, environment value, and generic executor data. Strict JSON denies duplicate, extra, accessor-backed, and oversized input.

**Frozen store/executor behavior:**

- The main-only store accepts only the exact controlled local-state layout object, flushes a temporary record before atomic publish, compare-and-swaps every transition, and reopens byte-identically. Corrupt or link-like entries deny without replacement.
- Retention keeps the newest 32 terminal records, every nonterminal record, and unrelated layout entries.
- The executor must persist `prepared` before workspace artifacts; flush the base snapshot and same-directory replacement; persist `ready`; freshly reauthorize root, target, base, and trust; persist `applying`; perform one replace; verify the reopened result hash; and only then persist `committed`.
- Nine injected crash checkpoints cover the durable/mutating boundaries. Startup reconciliation is idempotent: no journal exists before `prepared`; a base target rolls incomplete pre-result work back; the intended target finalizes committed; any third state remains explicit conflict/recovery.
- External change, missing target, root drift, same-directory temporary collision, cancellation rollback, corrupt/interrupted journal, generic callback injection, and outside-target attempts cannot overwrite selected, replacement-root, collision, or outside canaries.
- No unprivileged apply, journal, capability issuance, rollback, or recovery API exists. The future modules remain main-only, purpose-specific, no-shell, and zero-egress.

**Focused RED matrix:**

- `tests/unit/file-apply-journal-contract.test.ts`: 22/22 intended `ERR_MODULE_NOT_FOUND` for absent `file-apply-journal.ts`.
- `tests/integration/file-apply-journal-store.test.ts` plus `tests/integration/journaled-file-apply-executor.test.ts`: 20/20 intended `ERR_MODULE_NOT_FOUND` for the absent store/executor.
- `tests/security/journaled-file-apply-boundary.test.ts`: the current no-unprivileged-authority check passes; 10 checks intentionally fail only with absent-source `ENOENT`/`ERR_MODULE_NOT_FOUND`.

All `zenith-file-journal-test-*`, `zenith-file-apply-test-*`, and `zenith-file-apply-security-*` fixtures were removed from the validated OS temporary parent. Leftovers: zero.

**Baseline and intentional gate state:** Existing serial baselines excluding T0064 are GREEN at 87 unit, 62 integration, 12 component, and 39 active security tests, with one package-phase check skipped. `npm run verify` is intentionally RED only at the new unit contract: 87 existing checks pass and 22 expected missing-module checks fail. Exact Electron remains GREEN at 6/6 with zero retries.

**Honest contention note:** The first baseline attempt ran four Vitest projects concurrently. Only the existing diagnostics subprocess exceeded its five-second timeout; integration, component, and security stayed GREEN. The unchanged unit suite was rerun serially immediately and passed 87/87 in 1.96 seconds. No timeout, test, or product behavior changed.

**Architecture reconciliation:** ADRs 0004 and 0007 were synchronized with the controlled local-state journal, durable compare-and-swap publication, explicit recovery states, and no false cross-file/power-loss atomicity claim.

**Evidence:** `tasks/evidence/g2-file-apply-journal-red.md`, SHA-256 `5B31D1AC1981F93D685004B1BC6B2D2DBADD703B4314F770568CEA08FC0F3336`.

**Preview:** `tasks/evidence/artifacts/phase-t0064-m2-journal-red.png`, 1800x1125, SHA-256 `9F77D5E2FC74D363E871226778463014003A966DDB75079EFB4E65789422AC89`. The fresh image was visually inspected and is intentionally unchanged from T0063: the pane reports `INERT / NO FILE MUTATION`, the approval queue is zero, and no apply control or journal state appears.

**Exclusions and Git:** No production journal contract/store/executor, capability-issuance route, apply/replace/rename/rollback, startup recovery UI, mutation IPC/preload/renderer surface, network/DNS, credential read, process, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0065 only - implement the three frozen main-owned seams, consume the exact single-use approval immediately before effect, turn the T0064 matrix GREEN, and prove no mutation outside controlled fixtures.

### 2026-08-12 - T0065 main-only recoverable one-file apply GREEN

**State:** T0065 is complete and GREEN within a bounded main-only scope. It implements the three T0064 seams, but the production app does not construct or expose the store/executor, so renderer-visible behavior remains inert.

**Implemented authorities:**

- `src/shared/contracts/file-apply-journal.ts` implements the strict process-neutral schema-version-1 seven-state record: `prepared`, `ready`, `applying`, `committed`, `conflict`, `recovery-required`, and `rolled-back`.
- Canonical records bind proposal, approval, capability, workspace/root/trust, target identity/relative path, base/result identities and lengths, artifact names, recovery policy, sequence/time, sanitized error, and record digest while excluding nonce, content, raw paths, credentials, environment values, and generic executor data.
- `src/main/file-apply-journal-store.ts` accepts only the branded exact `%LOCALAPPDATA%\Zenith` layout, writes and flushes an exclusive temporary record, atomically publishes it, compare-and-swaps every transition, reopens byte-identically, rejects corruption, and removes only recognized safe artifacts.
- `src/main/journaled-file-apply-executor.ts` is a branded main-only capability consumer. It can be constructed only with the branded approval broker, durable audit service, exact journal store, and purpose-specific workspace reauthorization port; structural callback bags are rejected.

**Durable execution ordering:**

1. Persist correlated `workspace.file.apply` requested audit before `prepared`.
2. Persist `prepared`, then create and flush the base snapshot and an exclusive same-directory replacement.
3. Persist `ready`, then freshly reauthorize access/configuration trust, root, target identity, and base content.
4. Persist `applying`, revalidate target and replacement, consume the schema-version-2 single-use capability immediately before effect, and perform one rename/replace.
5. Reopen and verify the result hash, then persist `committed` and the correlated terminal audit.

Retention preserves the newest 32 terminal records, every nonterminal record, and unrelated entries.

**Crash, conflict, and canary proof:** Nine checkpoints cover `before-prepared`, `after-prepared`, `after-base-snapshot-flushed`, `after-replacement-flushed`, `after-ready`, `after-applying`, `after-replace`, `after-target-verified`, and `after-committed`. The matrix proves replay denial; external change; missing target; root drift; existing temp collision; cancellation; journal interruption/corruption; post-applying in-place path race; double idempotent startup reconciliation; generic callback denial; and preservation of selected, external, replacement-root, collision, and outside canaries. Capability replay is denied before a second journal or audit event.

**Recovery behavior:** No journal grants no recovery authority. A reviewed base target can remove incomplete safe artifacts and become `rolled-back`; the exact intended result can finalize `committed` only from `applying`; third-party state remains explicit `conflict` or `recovery-required` and is never overwritten.

**Residual limitation:** File and directory sync are used where supported. This is bounded crash-recovery behavior, not containment against a hostile same-user process or a guarantee beyond Windows/filesystem flush and sync semantics.

**Focused GREEN matrix:** 22/22 journal-contract, 5/5 store, 16/16 executor, 11/11 security, and 21/21 combined executor/audit tests passed.

**Complete verification:** `npm run verify` passed 109 unit, 83 integration, 12 component, and 50 active security tests; one package-phase check remains skipped. Exact Electron passed 6/6 with zero retries. The validated fixture scan found zero journal/apply/security temporary leftovers.

**Evidence:** `tasks/evidence/g2-file-apply-journal-green.md`, final SHA-256 `EA4E85B1E69464BBB349CCA1CCD147CDAC7C020F50624C81C4D743726829325A`.

**Preview:** `tasks/evidence/artifacts/phase-t0065-m2-file-apply-green.png`, 1800x1125, SHA-256 `C6C4921256424E0912FD2CD054A018547E54A3184214C5C1A8DFDCD10D9AB7CC`. The fresh image was visually inspected and is intentionally unchanged: the UI reports `INERT / NO FILE MUTATION`, exposes no apply control, and shows zero pending approvals.

**Exclusions and Git:** No application construction reaches the executor. No IPC/preload/renderer capability issuance, apply button, automatic apply, recovery UI, arbitrary directory/write API, network/DNS, credential read, process, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. Durable status documentation is synchronized through T0065. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0066 only - construct the main recovery service and accessible exact-Electron apply/recovery presentation without broadening beyond this one reviewed file transaction.

### 2026-08-12 - T0066 accessible Apply once and recovery GREEN

**State:** T0066 is complete and GREEN. It connects the T0065 executor through a narrow sender-owned application surface and permits exactly one reviewed selected-file replacement with visible terminal/recovery state.

**Redacted application contract:**

- `src/shared/contracts/file-apply-review.ts` defines strict schema-version-1 proposal, decision, prompt, result, and recovery views.
- Renderer-visible data is limited to selected relative path, base/current/intended SHA-256 identities, terminal state, bounded sanitized error, and deterministic guidance.
- The full approval proposal, capability/nonce, raw root/target paths, file bodies/base snapshot, temporary artifact identities, credentials, store, and executor never cross IPC or preload.
- A closed workspace cannot freshly derive the current digest and truthfully reports `CURRENT unavailable` until the exact controlled file is reopened.

**Main-owned service and authority flow:**

- Main constructs the controlled journal store and branded executor only after local state and durable audit are ready.
- `file-apply-service.ts` retains the pending exact proposal in main, bounds pending entries, revokes them on owner invalidation, and freshly verifies the immutable proposal plus selected workspace snapshot before prompt and decision.
- The renderer first performs the separate proposal review. The service then exposes an exact apply prompt; `Apply once` and `Deny` are separate decisions.
- Pending state is removed before capability issuance. Main issues the 30-second single-use capability only after fresh revalidation and immediately consumes it through the branded journaled executor.
- Strict sender-owned, deadline-bound IPC and a frozen three-method preload surface expose only `fileApply.propose`, `fileApply.decide`, and `fileApply.getRecovery`.

**Accessible UI and recovery behavior:** The UI presents exact diff review, then a distinct Apply-once/Deny decision, pending approval count, terminal result, and a separate accessible Recovery pane. Recovery shows base/current/intended digests and deterministic `reopen-workspace`, `new-reviewed-proposal`, `manual-recovery`, or no-action guidance. Conflicts are never overwritten automatically; continue or rollback requires reopening the controlled file and a new exact reviewed proposal, while manual recovery preserves third-party content.

**Tests-first history:** The intended RED boundary was 3/3 unit failures solely because `file-apply-review.ts` was absent and 1/1 component failure solely because the Recovery control/pane was absent.

**Complete verification:** The final current `npm run verify` passed 112 unit, 86 integration, 14 component, and 50 active security tests; one package-phase check remains skipped. Exact Electron passed 7/7 with zero retries. The forced crash/restart submatrix proved `after-ready -> rolled-back` and `after-replace -> committed` across two complete passes with zero retries. Validated cleanup found zero T0066 file-journal, apply, security, or recovery leftovers. Prettier and `git diff --check` are GREEN.

**Evidence:** `tasks/evidence/g2-file-apply-recovery-ui-green.md`, SHA-256 `228A2F270EE08E7F69EFF17472E7ABF2E6A892B76A84482501AA21A3D4BA04FA`.

**Preview:** `tasks/evidence/artifacts/phase-t0066-m2-recovery-ui-green.png`, 1800x1125, SHA-256 `3433855DE5FB0889BCBD7FDE84A560B9759F954A9DCF4C6BF6932F2CD5A94C8F`. The fresh image was visually inspected and shows the committed recovery view, one terminal journal, selected relative path, redacted base/current/intended identities, zero pending approvals, updated audit count, and no raw path or capability material.

**Later evidence-lifecycle correction (T0068):** The reusable app-shell scenario was still writing later captures directly to this T0066 path, so a later visually equivalent committed-recovery capture replaced those original bytes. The current honest T0066 image SHA-256 is `4FD526EE48D0E6FB2F5D0D82DAE8324F6F81F5A3CE5164038CEB2EBDC6048DD9`, and the transparently amended T0066 evidence SHA-256 is `F22297842AF4B959895CB8CA94889879EAADCCA98F4A6629D7282FDBD374BCA3`. The historical original identity remains recorded above. The harness now writes `latest-phase-preview.png`, and phase-specific images are copied once.

**Residual boundary:** Recovery remains bounded by operating-system/filesystem sync semantics and does not protect against a hostile same-user process. Terminal conflict data is preserved, not silently repaired or overwritten.

**Exclusions and Git:** No package/release/signing, network/real provider, general process, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No staging, commit, push, or remote mutation was performed; the user owns all Git operations.

**Next task:** T0067 only - write the RED fixed no-shell test-process proposal and runner boundary.

### 2026-08-12 - T0067 fixed no-shell verifier RED

**State:** T0067 is complete in the required tests-only RED state. It defines one immutable G2 verifier; it is not a terminal, shell, user command, package-script runner, PATH/PATHEXT lookup, or repository-selected executable.

**Frozen schema-version-1 process proposal:**

- Binds owner/run; packaged application identity; resolved Electron executable path/content SHA-256; immutable packaged verifier module path/content SHA-256; workspace plus access/configuration trust; canonical trusted cwd path/identity; selected relative file plus base/intended SHA-256; fixed policy/executor; and all limits.
- Arguments are exactly empty. Stdin is ignored. Shell, profile, PATH lookup, and detached execution are all false.
- Environment-key names are exactly ordered as `ZENITH_BASE_SHA256`, `ZENITH_INTENDED_SHA256`, `ZENITH_RELATIVE_PATH`, `LANG`, `NO_COLOR`, and `TZ`. Inherited, reordered, duplicated, missing, `PATH`, secret, or extra keys deny.
- Timeout is exactly 5,000 ms. Stdout and stderr are each bounded to 65,536 bytes; combined output is bounded to 98,304 bytes.
- Policy/executor identities are fixed to `fixed-g2-verifier-v1` and `main.fixed-test-process`.
- The required visible warning states that the verifier has the full authority of the current Windows user, is not an OS sandbox, and cancellation cannot reverse effects already produced.

**Frozen hostile and runner matrix:** Executable/module/app-root/cwd/workspace/trust/file/base/intended/policy/executor/run drift; shell metacharacters including `&&`, `$()`, and `%COMSPEC%`; nonempty args; repository/package/arbitrary module selection; wrong owner; capability replay; timeout/cancellation/output overflow mislabeled as success; broader budgets; accessors/extra fields/malformed identities; escaped module paths; and preload/renderer process exposure all deny. The future direct launch shape is fixed module, empty args, trusted cwd, fresh six-key environment, `stdio: "pipe"`, fixed service name, bounded UTF-8 output, observed exit code, and one kill request on timeout, cancellation, or overflow.

**Exact RED results:**

- Unit: 7/7 fail only because `src/shared/contracts/fixed-test-process.ts` is absent.
- Integration: 9/9 fail only because the contract, `src/main/fixed-test-process-resolver.ts`, and `src/main/fixed-test-process-runner.ts` are absent.
- Security: 3 intended absent-source failures plus 1 already-GREEN preload/renderer non-exposure check.

Every RED result is `ERR_MODULE_NOT_FOUND` or `ENOENT` at one of those three absent seams; no assertion failed against existing behavior.

**Preserved baseline:** Existing 112 unit checks pass plus 7 intended RED; 86 integration pass plus 9 intended RED; 50 existing active security plus 1 new non-exposure check pass, 3 are intended RED, and 1 package check is skipped. Format, lint with zero warnings, and both TypeScript projects are GREEN. The complete `npm run verify` is intentionally RED until T0068. The focused real-Electron app-shell scenario passed 1/1 with zero retries.

**Evidence:** `tasks/evidence/g2-fixed-test-process-red.md`, SHA-256 `3C1EF7EEC775192C936E7B547F9C57F8C0D33F6D20F7C14CB353D0D148081D99`.

**Preview:** `tasks/evidence/artifacts/phase-t0067-m2-fixed-process-red.png`, 1800x1125, SHA-256 `B1116013B80A2CB382CB5836CFC51985933B6E42DD464C103D6C804837D6EFD4`. The fresh image was visually inspected and is intentionally unchanged at the committed one-file recovery view; no runnable process, approval prompt, output, or process state appears.

**Exclusions and Git:** No production contract/resolver/verifier module, approval operation, runner, process launch, process IPC/preload/renderer surface, package, network/real provider, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No staging, commit, push, release, or remote mutation was performed; the user owns Git.

**Next task:** T0068 only - implement the smallest controlled main-only no-shell verifier that turns this exact matrix GREEN without adding general command authority.

### 2026-08-12 - T0068 fixed main-only no-shell verifier GREEN

**State:** T0068 is complete and GREEN. It implements the exact T0067 boundary but remains unconstructed and unreachable from application IPC, preload, renderer, or Tests UI.

**Strict proposal, resolution, and approval:**

- `src/shared/contracts/fixed-test-process.ts` provides a process-neutral schema-version-1 compiler/verifier with canonical SHA-256.
- The main resolver accepts only hard-coded `resources\app.asar.unpacked\utility\fixed-test-verifier.cjs`, performs bounded same-handle reads/hashes for the Electron executable and verifier, and proves canonical application/module containment plus trusted cwd identity.
- The approval vocabulary adds only `workspace.test.run` / `main.fixed-test-process`. Schema-version-2 capabilities gain a distinct nullable process-proposal SHA-256 binding while preserving preference and file-apply isolation.
- Immediately before launch, main reauthorizes workspace, access/configuration trust, canonical cwd, selected relative file, and intended file hash.
- Durable requested audit persists before capability consumption and before `utilityProcess.fork`.

**Direct supervised launch:** Electron `utilityProcess.fork` receives the fixed module, empty arguments, `stdio: "pipe"`, fixed service name, trusted cwd, and a newly constructed exact six-key environment. No shell, profile, PATH lookup, detached mode, inherited environment, or stdin exists.

Stdout/stderr are bounded and validated as UTF-8, with combined limits enforced. Supervision covers the fixed 5,000 ms timeout, owner cancellation/revocation, one-kill output overflow, late-event suppression, observed exit, and a one-second no-exit fallback returning `exitCode: null`. The immutable CommonJS verifier reads only the approved relative file, validates its intended SHA-256, emits one versioned JSON line, explicitly flushes, and exits.

**Preserved warning:** The verifier runs with the full authority of the current Windows user. Electron utility-process separation is lifecycle isolation, not an OS sandbox; kill/cancel is not reversal of completed effects or proof that arbitrary descendants stopped.

**Focused and full verification:** Contract unit passed 7/7, resolver/runner integration 9/9, and security 4/4. `npm run verify` passed 119 unit, 95 integration, 14 component, and 54 active security tests, with one package-phase check skipped. Full exact Electron passed 8/8 with zero retries.

**Exact utility matrix:** The production verifier completed with exit code 0; owner cancellation returned `cancelled`; the fixed deadline returned `timed-out`; and 70,000 hostile stdout bytes triggered exactly one kill, retained at most 65,536 bytes, set `outputTruncated: true`, and returned `output-limit`. Each of the four scenarios recorded exactly two durable audit events: requested before launch and the observed terminal outcome. The generated `node_modules\electron\dist\resources\app.asar.unpacked` probe and all `zenith-fixed-process-*` roots were removed; leftovers are zero.

**Honest implementation corrections:**

- The initial security regex overmatched harmless `applicationRootPath` as `PATH`; the test was narrowed to whole-word command/environment tokens only.
- The first real success reached timeout because setting `process.exitCode` left the utility process alive; the immutable worker now flushes and exits explicitly.
- The first full verify stopped at lint-only `no-require-imports` and `no-unsafe-finally` findings; narrow CommonJS/source cleanup structure was corrected before the final GREEN gate.

**Packaging boundary:** Forge marks only the fixed verifier for ASAR unpacking. No package command ran and T0068 makes no packaged-artifact claim; T0075 owns that proof.

**Evidence:** `tasks/evidence/g2-fixed-test-process-green.md`, SHA-256 `4923BE5F1B8609779E0EB1CF9782872DAB9205EBF0C2338C357B78E5129043A3`.

**Preview:** `tasks/evidence/artifacts/phase-t0068-m2-fixed-process-green.png`, 1800x1125, SHA-256 `4FD526EE48D0E6FB2F5D0D82DAE8324F6F81F5A3CE5164038CEB2EBDC6048DD9`. The fresh image was visually inspected and intentionally remains at the committed recovery view because no runnable process UI exists.

**Evidence lifecycle:** The app-shell harness now writes the reusable capture to `latest-phase-preview.png` rather than overwriting a historical phase filename. Each completed phase copies that capture once to its phase-specific evidence path. The T0066 correction is recorded above.

**Exclusions and Git:** The application does not construct the resolver/runner or expose process proposal, approval, IPC/preload/UI, handle, output, or cancellation state. No general command, package execution, network/real provider, Git, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No package, staging, commit, push, release, signing, deployment, or remote mutation occurred; the user owns Git.

**Next task:** T0069 only - expose a narrow approved fixed-verifier proposal/output/cancellation flow in the Tests panel without exposing process handles or generic execution authority.

### 2026-08-12 - T0069 approved fixed-verifier Tests UI GREEN

**State:** T0069 is complete and GREEN. The application can now propose, separately approve or reject, run, observe, and cancel only the immutable G2 verifier. This does not create a terminal, arbitrary executable, package-script, repository-selected command, shell, or general process surface.

**Strict application boundary:** A new schema-version-1 fixed-test review/status IPC contract carries only redacted review inputs, decisions, bounded status, and terminal output. Main-only `FixedTestProcessService` retains the full approval proposal, single-use capability, nonce, `AbortController`, and runner. Those authorities never cross IPC. The frozen preload surface exposes exactly `fixedTest.propose`, `fixedTest.decide`, `fixedTest.getStatus`, and `fixedTest.cancel`; it exposes no process or spawn primitive, process handle, capability, nonce, raw resolver, or arbitrary command input.

**Immutable asset and identity:** Vite emits the fixed verifier as an immutable asset for development and exact Electron E2E. Resolution still requires the verifier module to be the fixed contained application asset, while the external development Electron executable is read and exact-hashed before approval and launch. The T0068 fixed executable/module/cwd/file/hash/environment/budget/policy bindings and fresh reauthorization remain enforced.

**Accessible Tests panel:** The bottom Tests surface is a keyboard-operable tab that displays the exact executable, verifier module, trusted cwd, selected relative file, fixed budgets, and prominent full-current-Windows-user warning before Approve or Reject. It renders `running`, `cancel-requested`, `stopped`, `completed`, and `failed` states; observed exit code; and bounded stdout/stderr only as text inside `pre` elements. Focus management and a live region announce transitions. The UI repeats that cancellation cannot reverse effects already produced.

**Tests-first history:** The initial service integration was 2/2 RED solely because `src/main/fixed-test-process-service.ts` was absent. After implementation, the focused service suite passed 2/2.

**Honest verification corrections:** One full-integration run exposed a launch-timing race in the existing runner test. The immediate focused runner suite passed 5/5, and the unchanged full integration suite then passed 97/97; no product boundary was weakened. The first exact Electron application flow passed all new proposal, approval, completion, output, and cancellation UI assertions, then failed only because the inherited audit-count expectation was still 17. The expectation was corrected to the now-observed 29 events, with close/restart/delete checkpoints at 31/32/34, and the complete scenario reran GREEN.

**Complete verification:** `npm run verify` passed 119 unit, 97 integration, 15 component, and 54 active security tests; one packaged-artifact check remains skipped. Full exact Electron passed 8/8 with zero retries.

**Evidence:** `tasks/evidence/g2-fixed-test-ui-green.md`, SHA-256 `B304869A16CAC8630877E8DB88C44A6E94D04C8C5F58129AA364029E67B44D9C`.

**Preview:** `tasks/evidence/artifacts/phase-t0069-m2-tests-ui-green.png`, 1800x1125, SHA-256 `9C9BA5DE6E081E0809C0D4D55CEFD7141E2332816BDCA69BA0787B7405A998C1`. Visual inspection is GREEN: the Tests tab is selected; the verifier is Stopped; local-stop and non-reversal guidance plus bounded-output state are visible; committed edit context and zero pending approvals remain visible; and no content is clipped.

**Exclusions and Git:** No general process/spawn/terminal/package-script authority, raw process handle, capability, nonce, Git inspection/mutation, network/real provider, agent, skill, plugin, MCP, OmniRoute, Gemini CLI, or voice authority was added. No staging, commit, push, release, signing, deployment, or remote mutation occurred; the user owns every Git operation.

**Next task:** T0070 only - freeze RED hostile-repository fixtures for fixed, non-interactive, read-only Git status/diff without enabling repository-controlled execution.

### 2026-08-12 - T0070 hardened Git inspection RED

**State:** T0070 is complete in the required tests-only RED state. It freezes a fixed, non-interactive, read-only status/diff boundary and hostile repository fixture before any production Git adapter, IPC, preload, renderer, or UI exists.

**Tests-only additions:** `tests/fixtures/hardened-git-fixture.ts`, `tests/integration/hardened-git-inspector.test.ts`, and `tests/security/hardened-git-boundary.test.ts` define the acceptance and denial matrix. No production source was added.

**Frozen hostile boundary:** The matrix covers hostile repository, system, and global configuration; aliases and hooks; attributes and diff drivers; text conversion and external diff; clean/smudge filters; submodules; credential helpers; injected ambient Git environment; optional locks; linked worktrees; malformed or oversized output; non-repositories; cancellation; repository drift; and index, worktree, and configuration SHA canaries. The future adapter must remain fixed, non-interactive, bounded, read-only, and fail closed without allowing repository-controlled execution or mutation.

**Exact RED results:** Focused integration produced 1 already-GREEN boundary check and 6 intended failures, all solely because `src/main/hardened-git-inspector.ts` is absent. Focused security produced 1 already-GREEN non-exposure check and 1 intended failure solely because the same adapter is absent. No assertion failed against an implemented production seam.

**Preserved baseline:** The complete verification command is intentionally RED after all 119 unit tests passed and integration reported 98 passing plus the 6 intended failures. The unaffected pre-T0070 integration baseline remains 97/97 GREEN; component remains 15/15; existing active security remains 54/54 with one package-phase check skipped. Exact Electron remains 8/8 GREEN with zero retries. Format, lint, both TypeScript projects, and the static diff check are GREEN.

**Environment and cleanup:** The local executable reports Git `2.54.0.windows.1`. The review used the official `git-scm.com/docs/git`, `git-scm.com/docs/diff-options`, and `git-scm.com/docs/git-config` documentation. Cleanup found zero `zenith-git-red` fixture leftovers.

**Evidence:** `tasks/evidence/g2-hardened-git-red.md`, SHA-256 `0645DBF5611A6684966B930E539763FBDF762FE5887EF79323A0861069DBC178`.

**Preview:** `tasks/evidence/artifacts/phase-t0070-m2-git-red.png`, 1800x1125, SHA-256 `1EE11942ABE4D630524FBE019FE132A5505CE8ADF60810A31DA4BB58CC80585A`. The fresh image is visually unchanged because this phase added only tests and no production or UI capability.

**Exclusions and Git ownership:** No production Git execution or mutation, Git adapter, status/diff result, IPC, preload, renderer, UI, stage, commit, push, or remote mutation was added or performed. The user owns all repository Git operations.

**Next task:** T0071 only - implement the smallest fixed, non-interactive, read-only hardened Git status/diff adapter that turns this exact hostile matrix GREEN.

### 2026-08-12 - T0071 hardened selected-file Git inspection GREEN

**State:** T0071 is complete and GREEN. Zenith now exposes one schema-version-1 `git.inspect` method for a freshly authorized selected file. The route is fixed, bounded, non-interactive, read-only, and does not create general Git, repository, command, or mutation authority.

**Crucial design correction:** The initial status/diff approach was rejected during GREEN implementation because arbitrary repository clean-filter driver names cannot be enumerated safely before Git evaluates repository attributes. The final design does not ask Git to produce a worktree diff. It performs exactly one fixed `git cat-file blob :<selected path>` read of the selected path's staged index object, obtains current text through the same-handle workspace authorizer, and computes the bounded unified diff in main. This avoids activating repository-selected filters, text conversion, or external diff behavior.

**Strict execution boundary:** The adapter exposes one frozen `git.inspect` API. It resolves `git.exe` only from a finite local canonical set, reads and hashes that executable from the same handle, and rehashes it before and after execution. The single direct `execFile` call uses `shell: false`, ignored stdin, a fresh constrained environment, bounded output, and abort handling. Optional locks, prompts, system/global configuration, replacement objects, lazy fetch, pager, and fsmonitor are disabled.

**Fresh authorization and audit:** Immediately before inspection, main revalidates owner, run, request, workspace, access/configuration trust, canonical root, selected relative file, and the current selected-file SHA-256. Redacted `git.inspect` requested and terminal audit events retain correlation without repository content, paths, command output, executable details, environment, or credentials.

**Renderer and interface boundary:** The renderer receives only the redacted bounded inspection result through the frozen one-method API. It never receives the workspace root, executable, process handle, environment, stdin, generic command input, write primitive, capability, or nonce. The accessible Git panel shows selected-file state and bounded unified diff while preserving the explicit no-mutation/read-only warning.

**Focused verification:** The hostile integration matrix passed 7/7; security passed 2/2; focused preload/workspace checks passed 10/10; and component checks passed 15/15. All path, executable, configuration, environment, mutation, cancellation, drift, malformed/oversized-output, and non-repository boundaries defined by T0070 are GREEN under the final narrower design.

**Honest verification correction:** The first full verification attempt hit the known unrelated fixed-runner fake-timer launch-array race. The unchanged focused runner suite immediately passed 5/5, then the complete verification reran GREEN: 119 unit, 104 integration, 15 component, and 56 active security tests, with one packaged-artifact check skipped.

**Exact Electron and cleanup:** Full exact Electron passed 8/8 with zero retries using a real tracked repository and modified selected file. It proved the accessible UI, bounded diff, frozen one-method API, and correlated audit. Repository/system/global configuration, executable, index, worktree, and selected-file canaries remained byte-identical; the hostile marker and `index.lock` were absent. Git fixture leftovers are zero and fresh E2E roots were removed. The unrelated old `zenith-e2e-WP9qDv` directory remains untouched.

**Evidence:** `tasks/evidence/g2-hardened-git-green.md`, SHA-256 `3EA70D7A126B22C7ED873F209975ACE959721C55B6CFC29612F634B74C03097E`.

**Preview:** `tasks/evidence/artifacts/phase-t0071-m2-git-green.png`, 1800x1125, SHA-256 `375149D61CE812A0C43597881A77360E640754E61D2D7507A5DE5324FBD12A85`. Visual inspection is GREEN: the Git tab shows Modified, `NO MUTATION`, `OUTPUT BOUNDED`, `READ-ONLY NO WRITE REQUEST`, a bounded diff, zero pending approvals, and the current 24-event audit snapshot without horizontal clipping.

**Exclusions and Git ownership:** No Git mutation, index/worktree/configuration write, stage, commit, push, remote operation, generic Git command, terminal, or renderer process authority was added or performed. The user owns all repository Git operations.

**Next task:** T0072 only - prove bounded, structurally redacted audit and diagnostics correlation across the complete offline one-file loop.

### 2026-08-12 - T0072 offline-loop audit and diagnostics GREEN

**State:** T0072 is complete and GREEN. It closes correlated bounded audit coverage for the current offline loop and adds one public aggregate-only M2 diagnostics object without adding filesystem, provider, approval, process, Git, network, or renderer authority.

**Correlated redacted audit:** The audit vocabulary now permits the `run` category with `run.manifest.preview` and `run.proposal.preview`, plus `file.recovery.inspect` under `recovery`. Main wraps manifest preview, proposal preview, and recovery inspection in the existing `auditedOperation` boundary: a durable correlated `requested` record precedes the effect and a normalized terminal record follows it. The exact seven-field redacted draft retains only schema/sequence/time, category/action/outcome, correlation/request/run identifiers, and a bounded code. Attacker-supplied paths, file bodies, hashes, diffs, provider prompts, credentials, process output, environments, stack data, and extra fields are structurally discarded.

**Aggregate-only public diagnostics:** `npm run diagnostics` now emits one `m2` object containing only total audit count; `git`, `recovery`, `run`, and `workspace` category counts; requested/succeeded/denied/failed/cancelled outcome counts; total file-journal record count; and counts for the seven journal states. The SQLite reader is read-only, caps audit input at 256 events, exposes no record-output field, and counts only own string category/outcome fields. Journal inspection accepts at most 32 canonical UUID-named regular JSON files, rejects links and identity drift, caps each at 8,192 bytes, and reads only state. Invalid or unavailable controlled state yields null aggregates instead of partial untrusted output.

**Executable diagnostics proof:** The public command passed on Node `24.17.0`, npm `11.17.0`, Electron `43.3.0`, and Git `2.54.0.windows.1`, reporting zero current M2 audit events and journal records. Seeded secret, path, prompt, output, and temporary-root canaries were absent from serialized support output; only expected counts and states appeared.

**RED then GREEN:** Before production changes, focused unit reported 13 pass and 5 intended failures—three absent audit actions and two absent M2 aggregates—while security was 0/2 because route/action coverage and aggregate-only diagnostics source were absent. After the minimal implementation, focused audit/diagnostics unit passed 18/18, security passed 2/2, and `npm run diagnostics` exited 0 with the aggregate-only schema.

**Honest verification corrections:** One static assertion initially prohibited ordinary `stdout`/`stderr` property names anywhere in diagnostics source and falsely matched existing version probes and the final JSON write. It was narrowed to sensitive diagnostic field names; executable canary tests remain the authority for emitted content. The first full verification passed all 125 unit tests, then hit the known unrelated fixed-test fake-timer launch-array race. The unchanged focused runner suite immediately passed 5/5, and the next complete verification was GREEN.

**Complete verification:** Final `npm run verify` passed 125 unit, 104 integration, 15 component, and 58 active security tests; the one package-phase security check remains deferred to T0075. Exact Electron initially exposed only stale expected audit totals. Expectations were corrected to include requested/terminal pairs for initial, workspace, post-apply, and restart recovery inspection plus manifest and proposal preview; no product behavior changed. The complete matrix then passed 8/8 with zero retries.

**Cleanup and package boundary:** All fresh E2E runtime roots were removed. No T0072 canary appears in production source or the diagnostics script. `package.json` and `package-lock.json` are unchanged. Packaging-specific redaction proof remains explicitly deferred to T0075.

**Evidence:** `tasks/evidence/g2-offline-loop-audit-diagnostics-green.md`, SHA-256 `7241B9C743EE23813F4147FA9A0D6BAFEBC10B7C710F6D5FB7D1A41F90651B04`.

**Preview:** `tasks/evidence/artifacts/phase-t0072-m2-audit-diagnostics-green.png`, 1800x1125, SHA-256 `2BD0B81943C38BE779C2F553A16DD17B4177FC179CA6A81D545EDB16EB28D542`. The layout is intentionally unchanged for this privileged audit/diagnostics phase. Visual inspection confirms the selected Git tab still shows Modified, `NO MUTATION`, bounded output, and `READ-ONLY / NO WRITE REQUEST`; the committed one-file proposal, zero pending approvals, and readable 33-event local audit snapshot remain visible without horizontal clipping.

**Exclusions and Git ownership:** No real provider, remote egress, broader workspace enumeration, multi-file mutation, arbitrary process/Git command, Git mutation, package execution, definition, agent, skill, plugin, MCP, deployment, release, or voice authority was added. No staging, commit, or push occurred; the user owns all Git operations.

**Next task:** T0073 only - integrate and prove the complete visible G2 workbench loop without widening any privileged boundary.

### 2026-08-12 - T0073 visible G2 workbench integration GREEN

**State:** T0073 is complete and GREEN. It composes the already-authorized G2 surfaces into one legible offline workflow without adding a privileged API or widening filesystem, process, Git, provider, approval, or renderer authority.

**Six-step visible workflow:** The run inspector now presents `G2 OFFLINE LOOP` as Workspace, Manifest, Proposal, Apply, Verify, and Git. Each step derives waiting, active, complete, denied, cancelled/stopped, conflict/recovery, or attention state only from existing renderer view state. The successful captured path reports Workspace `Ready`, Manifest `Reviewed`, Proposal `Reviewed`, Apply `Committed`, Verify `Stopped`, and Git `Modified`. Stopped remains attention—not success—because cancellation is local best effort and cannot reverse effects; committed file state and modified Git state remain separately visible.

**Exact approval and recovery language:** File approval displays normalized `workspace.file.apply / replace-once`; fixed-verifier approval displays `workspace.test.run / fixed-verifier`. The always-visible drawer shows the current exact action while pending and `No approval awaiting decision` otherwise. Rejecting file approval remains side-effect free: the reviewed target, diff, replacement, identities, and denial stay visible; main destroys the denied capability; and `Request new approval` creates a fresh exact prompt instead of replaying the denied one. Conflict/recovery continues to preserve the proposal and route to the redacted Recovery pane.

**Keyboard and honest boundary panels:** The bottom surface is a roving-tabindex tablist. Arrow Left/Right/Up/Down, Home, and End select and focus tabs; every tab retains `aria-controls` to the single named panel. Terminal explicitly states `No terminal authority in G2` and identifies the fixed verifier as the sole process route. Logs states `No log viewer in G2` and points to aggregate-only diagnostics. Approvals explains that exact decisions appear inline and no generic approval queue exists.

**RED then GREEN:** Expanded component coverage initially produced 5 passes and 4 failures at the absent workflow map, keyboard navigation, honest inactive panels, normalized action, and fresh-after-denial behavior. The intermediate run reached 8/9 but replacing the stable `Tests panel` accessible name with `aria-labelledby` broke its established contract. Retaining the direct stable label while preserving `aria-controls` and roving focus produced focused 9/9 and full component 16/16 GREEN.

**Complete verification:** The post-documentation verification passed all 125 unit tests and then hit the same unrelated fixed-test fake-timer launch-array race. The unchanged focused runner immediately passed 5/5; the complete verification reran GREEN with 125 unit, 104 integration, 16 component, and 58 active security tests, while one package-phase check remains skipped until T0075. No T0073 product change was made for this retry. Exact Electron passed 8/8 with zero retries and explicitly proved both normalized approval actions, all six terminal workflow states, and the empty exact-action drawer state. Existing 320/768/1024/1440-width, 200% zoom, reduced-motion, forced-color, file apply/recovery, verifier completion/cancellation, and read-only Git checks remain GREEN.

**Cleanup and manifests:** All fresh E2E runtime roots were removed. `package.json` and `package-lock.json` are unchanged.

**Evidence:** `tasks/evidence/g2-visible-workbench-green.md`, SHA-256 `2E98365E2A55662F951F6E32AE914C62F9CE12467E0B0362A2DB472A5FAE78B0`.

**Preview:** `tasks/evidence/artifacts/phase-t0073-m2-visible-workbench-green.png`, 1800x1125, SHA-256 `147176CF0B9BECDA90A7F186E09535AFD948968941CA6F388542EBE2EBBB462F`. Visual inspection is GREEN: the full top bar and activity rail are visible; the center preserves the committed exact one-file proposal; the inspector shows the new six-step ready/reviewed/committed/stopped/modified map; the Git tab and Modified heading remain visible; and there is no horizontal clipping or unsupported capability claim.

**Exclusions and Git ownership:** This phase changes renderer composition, styles, component assertions, and exact Electron presentation assertions only. It adds no IPC/preload method, filesystem/process/Git authority, terminal, generic command/log/approval surface, real provider, network egress, definition, agent, skill, plugin, MCP, deployment, release, or voice capability. No staging, commit, or push occurred; the user owns all Git operations.

**Next task:** T0074 only - execute and preserve the complete Gate G2 exact Electron denial, restart, recovery, accessibility, and integration matrix.

### 2026-08-12 - T0074 complete Gate G2 exact Electron matrix GREEN

**State:** T0074 is complete and GREEN. The named `npm run test:e2e:g2` gate contains exactly app-shell, workspace-denial, file-apply-recovery, fixed-test-process, and g1-policy-matrix. With one worker and zero retries, pass one completed 5/5 in 27.2 seconds and pass two completed 5/5 in 27.1 seconds.

**Complete visible application proof:** The modified exact-Electron app rejects the first proposal with the selected file unchanged; denies the first file-apply approval with the file unchanged and capability consumed; obtains a fresh approval rather than replaying; performs exactly one journaled commit; runs the separately approved fixed verifier; displays hardened Git and correlated audit; closes; hard-restarts; shows committed recovery with CURRENT unavailable; and performs an actual trusted reopen. The visible terminal workflow remains Workspace Ready, Manifest Reviewed, Proposal Reviewed, Apply Committed, Verify Stopped, and Git Modified.

**Network and renderer boundary:** The app page captured zero HTTP(S) requests. Renderer inspection found no plugin, MCP, shell, or terminal API. Exact Electron continues to use the deterministic main-process `showOpenDialog` replacement, so no native operating-system dialog is presented or automated by this gate.

**Recovery and denial matrices:** The recovery fixture now additionally performs external mutation after `ready` twice. Each run ends in explicit conflict and preserves exact target text `export const external = 99;`, alongside two rollback and two committed-recovery runs. Dedicated matrices retain capability replay, drift, expiry, cross-owner, hostile path, sibling, binary, oversize, external read drift, late cancellation, and stale-trust denials.

**Honest focused history:** The first two-spec run had recovery GREEN, while the application assertion retained stale audit count 41 instead of 49. The first application rerun then used provisional post-reopen count 56 instead of observed 58. Only test expectations were corrected; the final application scenario passed 1/1.

**Complete verification:** `npm run verify` passed 125 unit, 104 integration, 16 component, and 58 active security tests; one package-phase check remains skipped until T0075. The full existing Electron suite passed 8/8 in 30.3 seconds. The static diff check is GREEN.

**Cleanup and package lock:** All fresh matrix roots were removed. The pre-existing unrelated `C:\Users\8kesh\AppData\Local\Temp\zenith-e2e-WP9qDv`, last written 2026-08-11 19:55:35, remains explicitly untouched. `package-lock.json` is unchanged at SHA-256 `11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Evidence:** `tasks/evidence/g2-complete-electron-matrix-green.md`, SHA-256 `0ACEE8A185972F19EFD06DD351EEB225FB5C84211CE344A55AF4E027C4B3DFFF`.

**Preview:** `tasks/evidence/artifacts/phase-t0074-m2-gate-proof.png`, 1800x1125, SHA-256 `A7844E742B3C4CC2EFBF0F4B0EB33B20B105B41A2DDA5E07EC506D9BAB85F140`. Visual inspection is GREEN: the committed proposal and diff remain visible; the six-step map reads Ready/Reviewed/Reviewed/Committed/Stopped/Modified; Git is selected; one journal and zero pending approvals are shown; and there is no horizontal clipping.

**Exclusions and Git ownership:** T0074 adds proof and test orchestration, not a new production capability. No package claim, real provider, network egress, general command, Git mutation, plugin, MCP, agent, skill, deployment, release, or voice authority was added. No staging, commit, or push occurred; the user owns all Git operations.

**Next task:** T0075 only - build and inspect the packaged artifact, including packaged redaction, immutable verifier placement/identity, forbidden-content scans, and package-boundary security.

### 2026-08-12 - T0075 packaged G2 boundary GREEN

**State:** T0075 is complete and GREEN. A fourth `tests/security/packaged-app.test.ts` artifact check now proves the G2 code surface, hardened Electron boundary, forbidden-content absence, and one immutable physical fixed verifier in the packaged application. The artifact remains unsigned and is not a public release.

**RED and packaging correction history:** The first run against the old G1 package retained the inherited 3 passes and intentionally failed the new check at absent `workspace.openControlled`. The first rebuilt G2 package contained the required code but Vite embedded the verifier inside ASAR at `.vite/build/resources/app.asar.unpacked` rather than the resolver's physical frozen path. The Vite asset emitter was removed, and Forge `packageAfterPrune` now copies only `utility/fixed-test-verifier.cjs` into staged `utility`. A filename `asar.unpack` rule still failed to create the physical path; changing to `asar.unpackDir: "utility"` made the focused packaged-app suite 4/4 GREEN.

**Fixed verifier identity:** The final package contains exactly one physical `resources/app.asar.unpacked/utility/fixed-test-verifier.cjs`, SHA-256 `5D1EBB9B28085B173CE77E8AF2D3745731A29C9CD8BC7FFE6E0169DE4AA24ADF`, byte-identical to source, with no erroneous ASAR-internal duplicate. The source-only E2E builder now explicitly copies that same source into temporary `build/resources/app.asar.unpacked/utility`.

**Honest E2E staging corrections:** The first named G2 run after emitter removal passed 4/5 because the temporary dev build lacked the verifier copy. A provisional copy to `runtimeRoot/resources` still failed because development `applicationRoot` is `runtimeRoot/build`. Correcting only the test staging path produced focused app 1/1 GREEN. Final named G2 pass one completed 5/5 in 30.3 seconds and pass two 5/5 in 28.0 seconds with zero retries; the full Electron suite passed 8/8 in 29.8 seconds.

**Verification history:** One `npm run verify` reached 103/104 integration before the known unrelated fixed-test fake-timer launch-array race. The unchanged focused runner immediately passed 5/5 and the next full run was GREEN. Final post-correction verification passed 125 unit, 104 integration, 16 component, and 58 active security tests, with the one package-context check skipped in the source-tree gate. Package and make completed GREEN; the built-artifact `verify-package` suite passed 4/4; and public diagnostics was GREEN with zero persisted M2 data.

**Artifact identities:**

- Packaged directory: 76 files, 364,801,491 bytes.
- Executable: 225,442,304 bytes, SHA-256 `85B7ED14F8427A7956DCC793E125F45550B1157B1C4FDF2CD0CF003DE88C5C1F`, signature status `NotSigned`.
- ASAR: 718,492 bytes, SHA-256 `FC1FC30F5A65406E7D8DE3A1A211CECDDFC64AB2B03C165F7191E7713E44A4EA`.
- ZIP: 144,472,524 bytes, SHA-256 `377FEFBC57D52AC329970CEB63B1D4B550CB33B27A337AB707BB6ECF8D351BA8`.
- Package report SHA-256: `74C6F7E34AAE7EB28F2A48D2E9A718644EF382F792CAE69532758BB519CBA984`.
- Source manifest: 282 files, SHA-256 `D8E71493E94D5F26F7D2B70ED55994697A9C9F0359496FE843157C90CC3D612B`.
- Unchanged lockfile SHA-256: `11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Hardened package scan:** Electron fuses, CSP, sandboxed/frozen preload boundaries, and forbidden-content scans are GREEN. The package contains no source files, tests, source maps, fixtures, canaries, raw local paths, file-journal residue, or unintended verifier duplicate. Upstream `inlineDynamicImports` and deprecated `fs.rmdir` warnings remain recorded; they are not hidden or claimed fixed.

**Cleanup:** Fresh packaging and E2E temporary roots were removed. Only the old unrelated `zenith-e2e-WP9qDv` directory remains explicitly untouched.

**Evidence:** `tasks/evidence/g2-packaged-boundary-green.md`, SHA-256 `D37DC27C3B395275CFCFD3302CAB26109710FB7D8DD2AA29324381EAF09C72F4`.

**Preview:** `tasks/evidence/artifacts/phase-t0075-m2-package-green.png`, 1800x1125, SHA-256 `AE8B8D797537DCDB4F74AE2A66F38CC4CA23550481A64F9FAD7A6A44F6DB407B`. The packaging-only phase is intentionally visually unchanged. Inspection shows the committed proposal/diff, Ready/Reviewed/Reviewed/Committed/Stopped/Modified workflow, one journal, selected Git panel, zero pending approvals, and no clipping.

**Exclusions and Git ownership:** No signing, publishing, deployment, release, real provider, network, general process/Git command, Git mutation, plugin, MCP, agent, skill, or voice authority was added. No staging, commit, or push occurred; the user owns all Git operations.

**Next task:** T0076 only - reconcile documentation and evidence, reproduce the frozen package from a fresh source tree, record residual limitations, and prepare the Gate G2 handoff without performing user-owned Git operations.

### 2026-08-12 - T0076 fresh-tree reproduction and Gate G2 handoff GREEN

**State and gate decision:** T0076 is complete. Gate G2 is GREEN for the verified local technical boundary, T0050-T0076 are complete, and inherited G0/G1 controls remain GREEN. The attributable offline one-file loop reproduced from a fresh source-only Windows tree. Publication remains a separate user-owned Git handoff.

**Fresh source-only tree:** A unique sibling reproduction tree is retained for audit and represented only as `<reproduction-root>`. The copy contained 284 source files with zero SHA-256 mismatches and no generated `node_modules`, `.vite`, `out`, `.types`, Playwright report, or test-results directories. `npm ci --ignore-scripts --offline --no-audit --no-fund` installed 693 packages while lifecycle scripts stayed disabled; the lockfile remained SHA-256 `11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927` throughout.

**Approved Electron restoration:** The repository-bound T0012 helper was not rerun. Only the already-approved extracted runtime and marker were copied: 75/75 runtime files matched, `electron.exe` is SHA-256 `31A0176B7C1A81CF379E55E109C57A56493A4D4A9E9B0D2475A678FD7DF234DC`, and both markers identify Electron `43.3.0`. The original helper approval remains bound to `SHA256:9B591B1CE839914CBEC1A859D10F942848BEB4D831FDC7B074E0B7F24CE2F6AF`.

**Isolated Git boundary:** Package verification requires a Git inventory, so an empty Git index was initialized only inside the reproduction tree. It has zero commits, remotes, or active hooks. T0076 did not mutate the main repository's Git state; staging, commit, push, and publication remain user-owned.

**Fresh command matrix:** Every reproduction command exited 0. Source verification passed 125 unit, 104 integration, 16 component, and 58 active security tests, with one pre-package context check skipped. Named G2 exact Electron passed 5/5 twice in 31.0 and 28.9 seconds with one worker and zero retries. Package, make, focused package verification 4/4, aggregate-only diagnostics, local CI validation, lifecycle-denial verification, and dependency audit all passed; the audit covered 719 resolved entries and 29 direct dependencies. The complete inherited exact Electron suite passed 8/8 in 32.1 seconds. Diagnostics reported zero persisted M2 audit events and journal records.

**Byte-identical unpacked payload:** The working and reproduction package directories each contain exactly 76 files and 364,801,491 bytes, with zero missing, extra, or SHA-mismatched paths. Matching identities are:

- `Zenith.exe`: `85B7ED14F8427A7956DCC793E125F45550B1157B1C4FDF2CD0CF003DE88C5C1F`;
- `app.asar`: `FC1FC30F5A65406E7D8DE3A1A211CECDDFC64AB2B03C165F7191E7713E44A4EA`; and
- physical fixed verifier: `5D1EBB9B28085B173CE77E8AF2D3745731A29C9CD8BC7FFE6E0169DE4AA24ADF`.

The reproduction ZIP is 144,472,524 bytes with SHA-256 `A0725FCD044A62108FAAFC44A6E7C764F72D39ADC8E3087F959A38BB01AE8A0C`. It differs from the equal-sized working ZIP because Forge records build-time container metadata; Gate G2 claims byte-identical unpacked application payloads, not bit-reproducible ZIP containers. The reproduction package report is SHA-256 `C2A185912A34A5E77C685D5C30ACB61EF18845CFDA2547FE2801777ABD475237`; the 284-file reproduction source manifest is SHA-256 `CED41040AF60F700AED78CB21E15FDDC82362DA2659D6B31143349848B9B3C4B`.

**Final evidence and residue audit:** All eight G2 requirement groups—controlled selected-file access, offline manifest/proposal, separate approval and journaled mutation, crash/conflict recovery, fixed verifier, hardened selected-file Git inspection, redacted audit/diagnostics, and packaged reproduction—are GREEN. Scans found zero absolute/reproduction-path leaks, forbidden names/content, orphan processes, recent temporary roots, lifecycle markers, package residue, or critical/high boundary failure. The old documented pre-M2 temporary root remains untouched, and the isolated reproduction tree is intentionally retained outside the repository.

**Durable documentation consistency:** Project status, task records, evidence, and durable documentation now consistently mark T0050-T0076 and local Gate G2 GREEN, distinguish local technical proof from Git publication or release, retain the offline/narrow authority boundary, and identify M3 atomic expansion as the next development step. Gemini CLI remains postponed until G11.

**Final main-tree verification history:** After durable-documentation synchronization, the first main-tree `npm run verify` passed all 125 unit tests and then hit the already documented fixed-runner fake-scheduling race at integration 104/104: the assertion observed a zero-length launch array before the queued launch published. No source or product behavior changed. The unchanged `tests/integration/fixed-test-process-runner.test.ts` immediately passed 5/5, then the complete main-tree verification passed 125 unit, 104 integration, 16 component, and 58 active security tests, with one package-context check skipped.

**Known limitations:** The package is unsigned and is not an installer, release candidate, or public release. Hosted CI is authored and locally validated but has not run remotely. ZIP/container bytes are not reproducible even though the unpacked payload is byte-identical. Windows same-user replacement races cannot be eliminated completely; post-effect verification and recovery bound supported failure behavior. The fixed verifier runs with current-user authority, is not an OS sandbox or general runner, and cancellation cannot reverse completed effects. The offline fake is not a real provider. Upstream `inlineDynamicImports`, recursive `fs.rmdir`, and locked transitive deprecation warnings remain. The old temporary root and retained reproduction tree remain explicitly documented.

**Evidence:** `tasks/evidence/g2.md`, SHA-256 `DE7EF8C4EE8971173FD0E3A440EDB9B94215BB6CCCD6A95A62AD605C7DD2973D`.

**Preview:** `tasks/evidence/artifacts/phase-t0076-m2-gate-green.png`, 1800x1125, SHA-256 `6B05151F2517F9929F10D31DCA2528834A1D909B0107D64784B4365FCC1F0D39`. Visual inspection is GREEN: the committed one-file diff, six-step G2 state, Modified Git view, one journal, and zero pending approvals are visible without clipping.

**Git handoff and next action:** No main-tree staging, commit, push, tag, release, deployment, or remote mutation occurred. The user owns publication. Development may proceed only by expanding M3 into an atomic, dependency-ordered plan before introducing further runtime authority.

## Phase-end documentation checklist

For each verified M2 phase, the implementing session should provide this journal's documentation owner with:

- phase/task IDs and concise scope;
- files changed and user-visible behavior;
- exact verification commands and exit codes;
- RED/GREEN evidence and denial/cancellation/recovery results;
- privileged capability schemas, exact bindings, expiry/consumption/revocation behavior, and whether any app route can reach them;
- journal state transitions, durable publication/CAS ordering, crash checkpoints, retention, startup reconciliation, and atomicity limitations;
- process identity/hash, arguments, cwd, ordered environment keys, shell/profile/PATH behavior, budgets, exit/cancel/cleanup state, and current-user-authority warning;
- disk, retention, and external-change canary outcomes plus validated temporary-fixture cleanup;
- initial failed, timed-out, flaky, or ambiguous verification attempts and the exact non-product correction;
- evidence document and fresh real-Electron screenshot paths;
- limitations, warnings, skipped/remote work, and unresolved findings;
- Git ownership/result; currently the exact intended phase files are reported and the user decides staging, commit, and push;
- the next executable task.

The journal update follows verification. It must not predeclare success, stage files, commit, push, or change `tasks/todo.md` on its own.
