> **Historical document.** This describes the Windows-only Zenith development workbench, the
> product direction replaced on 2026-09-13 by the current desktop harness. It is kept as a record
> and is not maintained. For the current product see `PRD.md`, `README.md`, and
> `docs/superpowers/specs/2026-09-15-harness-features-roadmap.md`.

---

# Zenith — Full Implementation Plan

**Status:** Approved roadmap; M0 ready for execution  
**Plan version:** 0.3.0  
**Date:** 2026-08-11  
**Project root:** `..`  
**Based on:** `SPEC.md` 0.3.0

> This roadmap deliberately proves a thin offline coding loop early, then expands it. The current file-level work is in `tasks/plan.md`; `tasks/todo.md` is the resumable state. Gemini CLI review is postponed to the final G11 gate.

## 1. Delivery objective

Build a local-first Windows desktop AI workbench that safely completes:

`trust workspace/config → select visible master/agent/skill → inspect effective context/egress → stream model output → review typed proposal → approve once → recoverably apply → approve test → inspect result, Git diff, and audit`

The MVP also includes editable Soul/Role/Agent/Skill/Command/Plugin libraries, all supplied assets, OpenAI, Anthropic, OpenRouter, NVIDIA NIM, local OpenAI-compatible endpoints, plugin/MCP trust, and a secure architectural seam for a later voice companion.

## 2. Scope rules

### MVP

- Windows Electron/React/TypeScript desktop app.
- Two-stage workspace/configuration trust.
- File/directory tree, editor, diffs, recoverable change journal, terminal/tests, hardened read-only Git plus separately approved branch/commit.
- Visible master and specialist runs; all supplied agents/skills/references/commands preserved.
- Five provider classes plus an offline fake provider.
- Central single-use approval broker for all app-mediated actions.
- Local persistence, encrypted app-managed credentials, audit, diagnostics, packaging.
- Local executable plugins and MCP-style stdio/HTTP tools with explicit full-authority warnings.

### Deferred

- OmniRoute, voice, wake word, cloud sync, collaboration, telemetry, marketplace, auto-update, auto-push/deploy/publish, non-Windows release, public signing.

### Change control

A change affecting trust boundaries, persistence, provider/plugin contracts, command identity, or acceptance criteria updates both `SPEC.md` and this plan. Work stops at the next safe checkpoint for user review.

## 3. Execution discipline

- `PLAN.md` is milestone-level; only current atomic tasks in `tasks/plan.md` are executable.
- Each atomic task has acceptance criteria, verification, dependencies, likely files, and a bounded scope.
- Dependencies form a real chain; a checkpoint is represented by an explicit gate task and cannot be bypassed.
- Test behavior first where practical: record RED evidence, implement the minimum, record GREEN evidence, simplify only while green.
- Establish test/lint/boundary tooling before production behavior that depends on it.
- Validate every IPC, manifest, definition, provider, tool, path, and persisted-state boundary at runtime.
- Treat all repository/model/skill/plugin/terminal content as untrusted data.
- Never execute discovered skill scripts, repository scripts, package scripts, plugins, or MCP servers automatically.
- Preserve existing/user work. Do not overwrite external changes or rely on cross-file atomicity.
- Use exact dependency versions and primary-source ADRs for framework-specific decisions.
- A feature includes denial, cancellation, error, recovery, redaction, documentation, and observable evidence—not only the happy path.

## 4. Planned repository boundaries

```text
../
├── src\
│   ├── main\              # windows, trust, approvals, credentials, coordination
│   ├── preload\           # frozen narrow bridge
│   ├── renderer\          # UI only
│   ├── utility\           # supervised storage/terminal/plugin workers
│   └── shared\            # process-neutral contracts and schemas
├── resources\
│   ├── bundled-agents\
│   ├── bundled-skills\
│   ├── bundled-commands\
│   ├── bundled-references\
│   └── provenance\
├── tests\
│   ├── unit\
│   ├── integration\
│   ├── component\
│   ├── e2e\
│   ├── security\
│   └── fixtures\
├── scripts\
├── docs\
│   ├── architecture\
│   ├── decisions\
│   ├── operations\
│   └── threat-model.md
├── tasks\
│   ├── evidence\
│   ├── plan.md
│   └── todo.md
├── AGENTS.md
├── SPEC.md
├── PLAN.md
└── README.md
```

Compiler configs, lint boundary rules, runtime schemas, and negative tests all enforce process separation. TypeScript aliases alone do not.

## 5. Stable local command contract

```text
npm run dev
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:component
npm run test:e2e
npm run test:security
npm run test
npm run verify
npm run diagnostics
npm run package
npm run make
npm run verify:package
```

CI may invoke only documented local commands. The M0 workflow file is authored and syntax/command-validated locally; an actual hosted Windows CI run requires a later explicit push/publication request and cannot be claimed before that.

## 6. M0 — Reviewed, reproducible skeleton

**Outcome:** durable contracts, threat model, supply-chain policy, test-first secure blank window, package artifact, and clean-checkout evidence.

| ID    | Work package                                 | Acceptance evidence                                                                                                                  | Depends on |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| M0.1  | Ratify v0.3 planning contract                | Review findings mapped to changes; Gemini deferral recorded                                                                          | None       |
| M0.2  | Preflight local tool/repository state        | Node/npm/Git versions, ancestor-repo status, and clean target recorded before mutation                                               | M0.1       |
| M0.3  | Establish context and hygiene                | Deterministic `main` Git repo, ignores, `AGENTS.md`, `README.md`                                                                     | M0.2       |
| M0.4  | Record ADRs and initial threat model         | Shell/tooling, process boundaries, Windows, persistence, providers, executable trust, approvals                                      | M0.3       |
| M0.5  | Declare exact dependencies safely            | Reject ranges/tags/aliases/git/file/URL/workspace protocols; scripts disabled                                                        | M0.4       |
| M0.6  | Resolve with scripts disabled                | Lockfile/registry/integrity/script-bearing package inventory                                                                         | M0.5       |
| M0.7  | Human lifecycle checkpoint                   | Exact scripts/hashes shown; explicit allow/deny recorded before execution                                                            | M0.6       |
| M0.8  | Establish tests and boundary rules           | Formatter/lint/type/test/E2E configs and seeded failure proof                                                                        | M0.7       |
| M0.9  | Build secure blank boundary by RED/GREEN     | Hardened main/preload, production CSP, minimal non-functional renderer landmarks                                                     | M0.8       |
| M0.10 | Prove E2E and packaging                      | Actual Electron launch, clean package/make, fuses/CSP/navigation/no-Node checks, artifact SHA-256                                    | M0.9       |
| M0.11 | Add safe diagnostics and workflow definition | Allowlisted redacted diagnostics; Windows workflow authored/validated but not represented as executed remotely                       | M0.10      |
| M0.12 | Reproduce and stop                           | Fresh temporary checkout, frozen install, immutable lock hash, exact commands/exit codes/tree/tool versions; unconditional user stop | M0.11      |

**Gate G0:** clean local evidence proves the exact reviewed tree can install, verify, launch, package, and pass security smoke without `D:\AI\skills\agent-skills` at runtime. The gate does not claim a hosted CI run. Progress stops for explicit user continuation.

## 7. M1 — Trust, policy, persistence, and secure shell

**Outcome:** recognizable UI over a minimal privileged policy foundation that every later mutation must use.

| ID   | Work package                                             | Acceptance evidence                                                                    | Depends on |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------- |
| M1.1 | Harden Electron surface                                  | Context isolation/sandbox/no Node, CSP/protocol, navigation/download/permission denial | G0         |
| M1.2 | Define typed IPC and sender policy                       | Versioned envelopes, narrow preload, ownership validation, cancellation                | M1.1       |
| M1.3 | Implement minimal approval broker                        | Single-use digest/nonce/expiry/drift invalidation and audit record                     | M1.2       |
| M1.4 | Define workspace identities and two trust state machines | Access/config trust, revocation semantics, no automatic repo execution                 | M1.3       |
| M1.5 | Implement local state and migrations                     | SQLite service, backup/recovery, `%LOCALAPPDATA%` layout                               | M1.3       |
| M1.6 | Implement credential handling                            | Transient entry, one-shot IPC, safeStorage, no plaintext fallback/retention            | M1.2, M1.5 |
| M1.7 | Build application chrome                                 | Rail, panes, workbench, inspector, bottom panel, approval drawer, recovery surfaces    | M1.2       |
| M1.8 | Add local audit/redaction/diagnostics                    | Correlated, bounded, local-only events; seeded secret scans                            | M1.3–M1.7  |

**Gate G1:** trust/revoke and one harmless typed approval survive restart; renderer cannot bypass the broker or retain a seeded credential.

## 8. M2 — Early offline vertical coding proof

**Outcome:** one small, complete, offline project-edit loop works before broad provider/configuration features are built.

| ID   | Work package                           | Acceptance evidence                                                               | Depends on |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| M2.1 | Open trusted fixture and read one file | Canonical root and Windows path-abuse tests                                       | G1         |
| M2.2 | Add offline fake provider              | Deterministic stream/tool proposal and abort tests                                | M2.1       |
| M2.3 | Build minimal visible run manifest     | Destination, selected file, fixed master, budget, tool schema visible before send | M2.2       |
| M2.4 | Propose one-file edit                  | Typed proposal with base hash and diff; no mutation before approval               | M2.3       |
| M2.5 | Apply through recoverable journal      | Single-use approval, journal, temp/replace, conflict/recovery states              | M2.4       |
| M2.6 | Run one controlled test command        | Exact process approval, bounded output, exit code, cancellation disclosure        | M2.5       |
| M2.7 | Inspect hardened Git diff and audit    | No repo helpers/hooks; action correlation visible                                 | M2.6       |
| M2.8 | Complete offline E2E                   | Open → fake request → approve edit → approve test → inspect → restart/reopen      | M2.7       |

**Gate G2:** the complete loop works offline on a temporary repository and every mutation is attributable, replay-resistant, recoverable, and visible.

## 9. M3 — Souls, roles, agents, skills, commands, and profiles

**Outcome:** supplied and user-defined behavior is intact, inspectable, editable, assignable, and subject to config trust.

| ID    | Work package                                | Acceptance evidence                                                                               | Depends on |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| M3.1  | Inventory supplied repository               | 24 skills, 4 agents, 7 references, 24 physical command artifacts/8 logical workflows, manifests   | G2         |
| M3.2  | Package byte-intact snapshot and provenance | Hash manifest and recursive link validation; no development-path runtime dependency               | M3.1       |
| M3.3  | Build modern schemas plus legacy adapters   | Existing minimal front matter loads without rewriting; unsafe links/collisions fail               | M3.1       |
| M3.4  | Implement layered registries                | Bundled/user/trusted-workspace provenance; workspace config inert until trusted                   | M1.4, M3.3 |
| M3.5  | Protect command identity                    | TOML/Markdown source adapters, `planning`/`plan` alias, reserved names unshadowable               | M3.4       |
| M3.6  | Build Soul and Role panes                   | Scope, edit, validate, preview, fork, external-change conflict                                    | M3.4       |
| M3.7  | Build Agents pane and assignment            | Add/edit/fork/enable/restore/trash/import/export; allowed skills; no recursion                    | M3.4       |
| M3.8  | Build Skills and Commands panes             | Full package details, references/scripts warning, lifecycle controls, `/` preview                 | M3.4–M3.5  |
| M3.9  | Build Profiles and Plugins registry pane    | File-backed selection with grants kept only in privileged state                                   | M3.4       |
| M3.10 | Add semantic gate presentation              | Prose checkpoints visible/advisory; only trusted sidecar gate manifests become hard runtime gates | M3.8       |

**Gate G3:** all supplied assets are intact and visible; user definitions are manageable; untrusted workspace definitions cannot affect a run.

**Status:** GREEN on 2026-08-29. `tasks/evidence/g3.md` is the authoritative local gate record.

## 10. M4 — Provider foundation and expansion

**Outcome:** the early loop runs through each requested provider without changing orchestration semantics.

| ID   | Work package                             | Acceptance evidence                                                                    | Depends on |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------------------- | ---------- |
| M4.1 | Freeze provider contract/conformance kit | Fake-server fixtures for streaming, tools, abort, usage, auth/rate/context errors      | G3         |
| M4.2 | Implement secure request policy          | HTTPS remote, loopback HTTP only, redirects off, destination display, size/time bounds | M4.1       |
| M4.3 | Add first approved real adapter          | Explicit user-selected OpenAI or local endpoint smoke; fake tests remain default       | M4.2       |
| M4.4 | Add OpenAI                               | Official SDK and independent fixture/conformance evidence                              | M4.2       |
| M4.5 | Add Anthropic                            | Official SDK and normalized events/tools/errors                                        | M4.2       |
| M4.6 | Add OpenRouter                           | Provider-specific validation/headers/error mapping                                     | M4.2       |
| M4.7 | Add NVIDIA NIM                           | Provider-specific validation/headers/error mapping                                     | M4.2       |
| M4.8 | Add generic local compatible endpoint    | Explicit loopback base URL and manual model diagnostics                                | M4.2       |
| M4.9 | Build provider settings/model picker     | Transient credential entry, capability-driven UI, test diagnostics                     | M4.3–M4.8  |

**Gate G4:** every provider adapter independently passes the same recorded conformance suite; no live credential is required in CI or committed evidence.

## 11. M5 — Full workspace, editor, diff, and recovery

**Outcome:** Zenith can safely create and modify real multi-file projects.

| ID   | Work package                                  | Acceptance evidence                                                                         | Depends on |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| M5.1 | Complete Windows path/identity matrix         | Traversal, symlink/junction/reparse, hardlink, ADS, device/reserved/UNC/extended/case tests | G4         |
| M5.2 | Build cancellable index/tree                  | Explicit ignores/overrides, binary/large classification, virtualization                     | M5.1       |
| M5.3 | Complete directory/file operations            | Create/rename/move/delete, empty dirs, recoverable trash                                    | M5.1       |
| M5.4 | Integrate Monaco and external-change handling | Encoding/EOL, buffers, save protection, reload/compare/copy                                 | M5.2       |
| M5.5 | Complete diff proposal UI                     | Unified/side-by-side, per-file/hunk selection, editable patch                               | M5.4       |
| M5.6 | Generalize recoverable transaction journal    | Multi-file base hashes, crash recovery, partial/rollback states                             | M2.5, M5.5 |
| M5.7 | Complete hardened read-only Git               | Status/branch/diff without repository-controlled helpers or mutations                       | M5.1       |

**Gate G5:** create a small project with nested/empty directories, select hunks, recover from an injected interruption, and inspect hardened Git state.

## 12. M6 — Master orchestration, context, agents, skills, and slash commands

**Outcome:** visible, deterministic multi-agent/skill workflows operate over the established provider and proposal loop.

| ID   | Work package                     | Acceptance evidence                                                                 | Depends on        |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| M6.1 | Define run/event state machines  | Queued/streaming/approval/cancel/partial/error/completed transitions                | G5                |
| M6.2 | Build effective-context compiler | Soul/Role/Agent/Skills/files/tool schemas/summaries/truncation and token budget     | M3, M6.1          |
| M6.3 | Build visible master             | Explicit selection/recommendation; no hidden persona replacement                    | M6.2              |
| M6.4 | Enforce agent/skill rules        | Agent allowlists, disabled/missing states, no recursion, semantic vs hard gates     | M3.7, M3.10, M6.3 |
| M6.5 | Build slash registry/completion  | Required lifecycle/direct commands, source/provenance, collision policy             | M3.5, M6.3        |
| M6.6 | Implement independent fan-out    | `/ship` peer runs, partial failure, dissent-preserving merge                        | M6.4              |
| M6.7 | Build run inspector/timeline     | Effective egress, run tree, hashes, proposals, approvals, costs/usage when supplied | M6.1–M6.6         |

**Gate G6:** invoke `/skill`, `/agent`, and `/ship`; prove no recursion, no reserved-command override, and faithful context/dissent display.

## 13. M7 — Terminal, tests, and Git project workflow

**Outcome:** approved commands and basic Git mutations complete a practical coding workflow.

| ID   | Work package                               | Acceptance evidence                                                                            | Depends on |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------- |
| M7.1 | Build executable resolution/approval model | Resolved executable/path/hash, arguments, cwd, PATH/PATHEXT, profiles, env keys, policy digest | G6         |
| M7.2 | Implement supervised ConPTY service        | Resize, bounded streams, exit code, timeout, cancel/process-tree cleanup                       | M7.1       |
| M7.3 | Add package-script expansion               | Exact pre/main/post content and lock hash shown before approval                                | M7.1       |
| M7.4 | Build terminal and tests panels            | Accessible terminal modes, structured test parsing plus raw fallback, rerun proposals          | M7.2–M7.3  |
| M7.5 | Add branch/commit proposals                | Separate approvals; push/reset/clean/deploy absent                                             | M5.7, M7.1 |
| M7.6 | Run real critical project loop             | Selected provider/agent/skill, multi-file edit, focused test, Git/audit, restart               | M7.4–M7.5  |

**Gate G7:** the full non-plugin coding loop passes repeatedly on controlled Windows fixtures with clear full-current-user process warnings.

## 14. M8 — Plugins and MCP-compatible connections

**Outcome:** local capability bundles are discoverable, explicitly trusted, diagnosable, revocable, and honest about authority.

| ID   | Work package                           | Acceptance evidence                                                            | Depends on      |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------ | --------------- |
| M8.1 | Define manifest and identity           | Versioned schema, hashes, contributions, compatibility, requested capabilities | G7              |
| M8.2 | Metadata-only discovery/install        | Malicious marker proves no entry point starts during scan                      | M8.1            |
| M8.3 | Full-authority trust/start approval    | Same-user fs/process/network/env warning; startup side-effect warning          | M8.2            |
| M8.4 | Supervise one process per plugin       | Fault isolation, crash limit, stop/revoke, output bounds                       | M8.3            |
| M8.5 | Add MCP stdio                          | Explicit executable/args/cwd/env refs; startup separately approved             | M8.3–M8.4       |
| M8.6 | Add MCP HTTP                           | HTTPS/loopback, redirects off, secret refs, time/size bounds                   | M4.2, M8.4      |
| M8.7 | Route cooperative calls through broker | Typed tool arguments, single-use approval, drift/plugin-instance binding       | M1.3, M8.4–M8.6 |
| M8.8 | Complete Plugins pane                  | Install/config/status/permissions/logs/restart/disable/uninstall/provenance    | M8.7            |

**Gate G8:** install a local fixture plugin, approve startup and one cooperative call, deny an escape proposal, survive a crash, revoke and uninstall. Evidence never claims containment of arbitrary trusted code.

## 15. M9 — Integrated design, accessibility, and performance

**Outcome:** all capabilities feel like one deliberate tool and remain usable under realistic load and assistive settings.

| ID   | Work package                                 | Acceptance evidence                                                                           | Depends on |
| ---- | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| M9.1 | Complete information architecture and states | Empty/loading/offline/streaming/approval/denied/cancel/conflict/recovery                      | G8         |
| M9.2 | Complete composer and inspectors             | `/`, `@file`, chips, effective egress, budgets, stop, run details                             | M9.1       |
| M9.3 | Accessibility matrix                         | Keyboard, screen-reader smoke, zoom, forced colors, contrast, reduced motion, focus return    | M9.1–M9.2  |
| M9.4 | Responsive matrix                            | 320/768/1024/1440 widths and drawers/resizable panes                                          | M9.1       |
| M9.5 | Measure named performance fixtures           | Cold start, package size, large tree, provider/PTY streams, memory; hardware/profile recorded | M9.1       |
| M9.6 | Optimize only measured regressions           | Improvement exceeds variance; no speculative complexity                                       | M9.5       |

**Gate G9:** critical workflow passes the accessibility/responsive matrix and accepted numeric budgets on named fixture/hardware profiles.

## 16. M10 — Hardening and local release candidate

**Outcome:** a reproducible Windows build with documented residual risks and recovery.

| ID    | Work package                         | Acceptance evidence                                                                           | Depends on  |
| ----- | ------------------------------------ | --------------------------------------------------------------------------------------------- | ----------- |
| M10.1 | Refresh threat model and abuse suite | IPC, paths/races, prompt injection, approvals, providers, terminal, plugins, secrets          | G9          |
| M10.2 | Dependency/license/provenance review | Lock/audit triage with severity, reachability, disposition, review date                       | M10.1       |
| M10.3 | Data recovery/export/reset           | Definitions export, DB backup/restore, journal recovery, safe clear                           | M10.1       |
| M10.4 | Documentation and operational guides | README, architecture, providers, definitions, plugins, security limits, troubleshooting       | M10.1–M10.3 |
| M10.5 | Clean package/install verification   | Clean temp tree, lock/artifact hashes, architecture, unsigned warning, no dev-path dependency | M10.2–M10.4 |
| M10.6 | Independent supplied-agent reviews   | Code, security, and test reports with severity rubric and dissent                             | M10.5       |

**Gate G10:** all release-blocking local findings are closed; package/recovery/docs evidence is complete. No publication occurs.

## 17. M11 — Final independent and Gemini review gate

**Outcome:** final release declaration only after fresh independent review and the postponed cross-model review.

| ID    | Work package                                  | Acceptance evidence                                                                   | Depends on |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| M11.1 | Re-run full evidence from clean tree          | Exact commands, exit codes, tree state, versions, lock/artifact hashes, redacted logs | G10        |
| M11.2 | Fresh-context adversarial review              | Findings classified as valid, invalid, or accepted tradeoff with evidence             | M11.1      |
| M11.3 | Install/use Gemini CLI for cross-model review | Version/auth method explicitly approved then; prompt/artifact scope recorded          | M11.2      |
| M11.4 | Reconcile cross-model findings                | No unresolved critical/high; accepted residual risk documented                        | M11.3      |
| M11.5 | Execute `/ship` readiness merge               | Reviewer/security/test runs, rollback/recovery plan, go/no-go                         | M11.4      |
| M11.6 | Explicit user release decision                | User chooses stop, private unsigned build, or later publication/signing plan          | M11.5      |

**Gate G11:** MVP release candidate. This is where the postponed Gemini CLI process occurs; it is not silently skipped.

## 18. Voice companion — post-MVP

After G11 only: privacy/threat ADR → transport-neutral audio contracts → push-to-talk → editable transcript → local STT/TTS preference → floating companion → same command engine → visual approval for sensitive actions → optional wake phrase as a separate opt-in. Voice never creates an alternate authority path.

## 19. Skill and review application

The 24 supplied skills remain independently invokable. Zenith development uses their roles as follows:

- Specification/planning: `using-agent-skills`, `interview-me`, `idea-refine`, `spec-driven-development`, `planning-and-task-breakdown`, `doubt-driven-development`.
- Delivery: `incremental-implementation`, `test-driven-development`, `source-driven-development`, `context-engineering`, `api-and-interface-design`.
- Product/code quality: `frontend-ui-engineering`, `browser-testing-with-devtools`, `debugging-and-error-recovery`, `code-review-and-quality`, `code-simplification`.
- Operations: `security-and-hardening`, `performance-optimization`, `observability-and-instrumentation`, `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `shipping-and-launch`.

The four supplied personas report independently. The master may synthesize but must retain dissent, missing results, and failed runs.

## 20. Evidence contract

Each gate record includes:

- timestamp/time zone, task/commit or tree hash, and dirty/untracked state;
- exact command and expected/actual exit code;
- Node/npm/Git/Electron/tool versions;
- lockfile SHA-256 and, for packaging, artifact SHA-256/architecture/unsigned state;
- approval identity, operation digest, and decision without secret values;
- RED/GREEN records for behavior tasks;
- redacted raw log/artifact paths and known limitations;
- reviewer finding severity: critical, high, medium, low, or informational.

G0 reproduction uses a fresh temporary checkout/copy, removes stale build outputs first, uses the frozen reviewed lockfile, and proves lockfile immutability. Hosted CI evidence is recorded only after a workflow actually runs on a remote runner.

## 21. Key risks and standing decisions

| Risk                                          | Standing decision / stop condition                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Forge Vite or Playwright Electron instability | Pin exact versions; prove at G0; use ADR-approved fallback before feature work                                      |
| Lifecycle scripts                             | Install with `--ignore-scripts`; bind review to lock/script hashes; stop for explicit user approval                 |
| Executable plugin/MCP/terminal authority      | Full current-user warning; no sandbox claim; revoke/stop app-started process; broker covers only app-mediated calls |
| Workspace config prompt injection             | Separate config trust; inert preview; privileged grants; reserved commands protected                                |
| Windows path race/escape                      | Central execution-time authorization, hostile fixture matrix, residual-risk disclosure; any escape blocks writes    |
| Secret exposure                               | Scope promises to app-managed credentials; transient entry; redaction; seeded scans; any leak blocks release        |
| Provider egress drift                         | Display destination/effective context; HTTPS/loopback policy; redirects off; no silent failover                     |
| Recoverable transaction interruption          | Durable journal/recovery states; never claim multi-file atomicity                                                   |
| Cancellation overclaim                        | Distinct local/remote states and warnings; orphan or hidden continuation blocks relevant gate                       |
| Scope growth                                  | G2 offline vertical loop remains first; new ideas enter backlog unless required by acceptance                       |

## 22. Definition of done

A task is done only when planned and failure behavior, focused tests, RED/GREEN evidence, types/lint/format, redaction/diagnostics, docs, and recovery state pass without overwriting unrelated work.

A milestone is done only when all task evidence is complete, the clean demo passes, earlier gates remain green, required reviews are resolved, and the user receives results/limitations. Gate tasks stop unconditionally for user continuation where specified.

MVP is done only when G11 passes, every `SPEC.md` acceptance criterion maps to evidence, all supplied assets are packaged without the source path, all requested providers pass conformance, no seeded app-managed secret leaks, and a fresh user can follow the README through setup, project work, approvals, recovery, and security limitations.

## 23. Immediate execution sequence

Gates G0-G3 are complete. The next executable work is a reviewed dependency-ordered atomic expansion of M4.1-M4.9 before provider implementation:

1. Freeze the provider contract and independent conformance fixtures for streaming, tools, abort, usage, and normalized errors.
2. Freeze secure request policy for HTTPS remote endpoints, loopback-only HTTP, redirects, destination display, and finite size/time bounds.
3. Add the first separately approved real adapter while keeping fake-server tests as the default proof path.
4. Add OpenAI and Anthropic through independent conformance evidence.
5. Add OpenRouter and NVIDIA NIM with provider-specific headers, validation, and error mapping.
6. Add an explicit loopback local-compatible endpoint and manual model diagnostics.
7. Build provider settings and a capability-driven model picker without changing orchestration semantics.

The consolidated status, rationale, and remaining roadmap are maintained in `docs/PROJECT-STATUS-AND-ROADMAP.md`. `tasks/todo.md` remains the current execution pointer.

## 24. Approval record

- Product direction and local-first design: approved.
- Skill-led refinement followed by development: explicitly approved.
- Version 0.3.0 incorporates three fresh-context reviews.
- Gemini CLI review: explicitly postponed to G11.
- M0 execution: authorized, subject to its lifecycle-script and G0 stop gates.
- M1 execution: explicitly continued by the user and completed through Gate G1.
- A fresh real-Electron screenshot is required after every completed development phase.
