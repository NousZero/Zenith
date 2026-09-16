> **Historical document.** This describes the Windows-only Zenith development workbench, the
> product direction replaced on 2026-09-13 by the current desktop harness. It is kept as a record
> and is not maintained. For the current product see `PRD.md`, `README.md`, and
> `docs/superpowers/specs/2026-09-15-harness-features-roadmap.md`.

---

# Zenith — Product and Engineering Specification

**Status:** Approved for Milestone 0 implementation  
**Version:** 0.3.0  
**Date:** 2026-08-11  
**Target:** Local-first Windows desktop application  
**Project root:** `..`

> This specification is the product contract. `PLAN.md` is the program roadmap; `tasks/plan.md` and `tasks/todo.md` are the current executable plan. Three fresh-context reviews were reconciled into version 0.3. Gemini CLI review is deliberately deferred to the final G11 release gate at the user's request.

## 1. Product summary

Zenith is a local-first AI development workbench. It combines a visible master orchestrator, editable personalities, specialist agents, reusable skills, slash commands, multiple model providers, project files, diffs, terminal and test execution, Git inspection, plugins, MCP-compatible tools, and a later voice companion.

The first trustworthy product loop is:

`open and trust folder → choose context/agent/skill → ask provider → inspect proposed change → approve → recoverably apply → approve a test → inspect output, Git diff, and audit trail`

Zenith is not a hidden autonomous swarm. The main session is always visible and owns delegation. Model text is never authority to mutate files, launch processes, disclose credentials, or start plugins.

## 2. Users and uses

The primary user is a single technical owner on Windows who wants Claude Code/Codex-class project work while retaining local control over definitions, providers, credentials, tools, actions, and records.

Primary uses:

1. Open an existing repository or empty folder.
2. Explain, design, plan, create, edit, test, and review full projects.
3. Select the master role, a specialist agent, or a skill explicitly.
4. Invoke agents, skills, commands, files, folders, plugins, and providers through `/` commands.
5. Add, edit, fork, disable, restore, import, export, or delete user definitions in the UI.
6. Inspect exact context and outbound destination before a provider call.
7. Inspect and selectively approve proposed file changes.
8. Approve a precisely rendered process or plugin start and inspect its output.
9. Switch among OpenAI, Anthropic, OpenRouter, NVIDIA NIM, and local OpenAI-compatible endpoints.
10. Later summon a Clippy-like, push-to-talk voice companion over the same policy engine.

## 3. Goals and boundaries

### Goals

- Deliver a dependable local coding loop before voice features.
- Keep every supplied agent, skill, shared reference, and command artifact byte-intact in a versioned bundled snapshot.
- Make Soul, Role, Agents, Skills, Commands, Plugins, workspace context, runs, and approvals visible.
- Support complete project work: directories, files, editor buffers, proposed multi-file changes, tests, terminal, Git, and recovery.
- Keep provider behavior behind a normalized, capability-aware interface.
- Keep persistence and audit local, with no Zenith cloud account or telemetry.
- Reserve a provider extension point for a possible future OmniRoute integration without exposing OmniRoute in MVP.

### Not in MVP

- OmniRoute.
- Voice capture, wake word, or an always-listening microphone.
- Cloud sync, collaboration, hosted backend, or uploaded telemetry.
- Plugin marketplace or automatic plugin updates.
- A claim that arbitrary executable plugins, MCP servers, terminals, or package scripts are sandboxed.
- Automatic push, deployment, publishing, purchases, or external messaging.
- macOS/Linux release, public signing, or automatic updater.

## 4. Invariants

1. **The user orchestrates.** The main session may recommend but never silently substitute an agent or skill.
2. **Only the master delegates.** Specialist agents may apply allowed skills but cannot recursively start agents.
3. **Definitions are data.** Repository text, model output, skill instructions, command packages, plugin output, and terminal output cannot override host policy.
4. **Hard gates are machine-enforced.** Consequential app-mediated actions require a typed proposal and valid approval capability.
5. **Semantic skill gates are honest.** Workflow checkpoints remain visible and model/user-controlled unless a trusted machine-readable gate manifest exists; prose alone is not claimed as enforceable policy.
6. **The renderer is unprivileged.** No Node integration, raw IPC, filesystem, process, credential-store, or unrestricted Electron access.
7. **Secrets are scoped.** App-managed credentials are never persisted in Markdown, React/global renderer state, prompts, diffs, logs, or diagnostics. Credential entry is transient renderer input, sent once over a narrow IPC method, cleared immediately, and then stored encrypted.
8. **Bundled assets are recoverable.** Built-ins are never rewritten. User edits create forks; user deletions are recoverable.
9. **Cancellation is accurately represented.** UI distinguishes `cancel requested`, `local execution stopped`, `remote may still continue`, `completed`, and `failed`.
10. **Local-first means no hidden egress.** Network calls occur only to the displayed configured provider or an explicitly trusted network tool.

## 5. End-product experience

### Main window

- **Top bar:** Zenith mark, workspace, profile, provider/model, destination/connection state, search, command palette.
- **Left activity rail:** Workspace, Soul, Role, Agents, Skills, Commands, Plugins, Settings.
- **Left pane:** searchable list/details for the active area. User items support add, edit, duplicate/fork, enable, disable, restore, import/export, and delete.
- **Center workbench:** conversation, files, definitions, plans, diffs, test results, and diagnostics in tabs.
- **Composer:** multiline input, `/` completion, `@file` references, visible agent/skill chips, context budget, effective-egress preview, send, and stop.
- **Right inspector:** master/agent run tree, provider/model/endpoint, effective Soul/Role/Agent/Skills, tool schemas, selected files, summaries/truncation, usage, approvals, and dissent/failures.
- **Bottom panel:** terminal, problems, tests, Git, logs, and approval queue.
- **Approval drawer:** normalized operation, exact target/arguments, current directory, base hashes, executable/plugin identity, policy version, risk warning, and Approve/Reject/Edit.

### Visual and accessibility language

- Organic, dark, compact design under the name **Zenith**.
- Graphite surfaces, parchment text, restrained moss/lime accent, and amber only for warnings/approvals.
- No decorative AI gradients, font CDN, or excessive glass effects.
- Visible focus and state, keyboard-first navigation, screen-reader names, logical focus return, and announcement throttling.
- Support 320, 768, 1024, and 1440 CSS-pixel widths, 200% zoom, reduced motion, forced colors, and WCAG 2.2 AA contrast.
- Monaco, terminal, tree, diff, timeline, and resizable panels each need documented keyboard entry/escape and a non-visual status path.

## 6. Local configuration and trust

App-owned state uses `%LOCALAPPDATA%`, not roaming `%APPDATA%`:

```text
%LOCALAPPDATA%\Zenith\
├── library\
│   ├── profiles\<profile-id>\
│   │   ├── soul.md
│   │   ├── role.md
│   │   ├── agents.md
│   │   ├── skills.md
│   │   └── plugins.md
│   ├── agents\<agent-id>.md
│   ├── skills\<skill-id>\...
│   ├── commands\<command-id>\...
│   └── plugins\<plugin-id>\zenith.plugin.json
├── state.db
├── secrets.bin
├── journals\
├── logs\
└── trash\

<workspace>\.zenith\
├── profile.json
├── soul.md
├── role.md
├── agents.md
├── skills.md
├── plugins.md
├── agents\...
├── skills\...
└── commands\...
```

There are two distinct trust decisions:

1. **Workspace access trust** authorizes bounded app-mediated reads and, separately, proposed writes within the resolved workspace identity.
2. **Workspace configuration trust** authorizes repository-owned `.zenith` definitions to affect prompts, agents, skills, commands, or plugins.

Until configuration is trusted, workspace definitions are previewable but inert. Markdown never stores executable grants or approval capabilities. Grants live in privileged app state. Revocation cancels active work, invalidates approvals and cached context, stops app-started processes/plugins, and closes workspace handles where possible.

Rules:

- New Zenith definitions use versioned validated schemas.
- Existing supplied agents/skills/commands load through legacy adapters and sidecar provenance metadata; the app must not rewrite them to add fields.
- Built-ins are read-only; edits create user forks.
- Precedence is bundled → user → trusted workspace, but reserved lifecycle commands cannot be shadowed. Collisions are visible.
- Concurrent external edits are detected by full content hash; the app offers reload, compare, or save-copy.
- Markdown can request capabilities but cannot grant them.

## 7. Supplied assets and commands

Development source: `D:\AI\skills\agent-skills`. The installer packages a versioned snapshot and never requires this development path at runtime.

Required inventory:

- 24 independent skill packages under `skills\`, with referenced scripts/assets and all relative links preserved.
- Four personas: `code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor`.
- Seven shared references: definition of done, orchestration, accessibility, testing, security, performance, and observability.
- Eight logical command workflows: `build`, `code-simplify`, `plan/planning`, `review`, `ship`, `spec`, `test`, `webperf`.
- Twenty-four physical command artifacts preserved by provenance: eight canonical TOML files in `commands\`, eight Gemini TOML mirrors in `.gemini\commands\`, and eight Claude Markdown wrappers in `.claude\commands\`. `planning.toml` and the Claude `/plan` wrapper are source-specific aliases of one logical workflow, not files to rename.
- Original plugin manifests and interoperability metadata remain in the snapshot.

The build fails when required inventory, hashes, or internal relative links are missing. Discovery reads metadata only; it never executes skill scripts.

### Orchestration

- The master is a visible runtime role, not a hidden persona file.
- `/ship` may start the reviewer, security auditor, and test engineer as isolated peer runs and merge their structured reports while retaining disagreement and failures.
- `/webperf` starts the web-performance auditor separately.
- Each run records definition hashes, selected skills, provider/model/endpoint, effective context manifest, proposals, approvals, tool calls, result, and cancellation state.

### Slash commands

Required commands:

`/ideate`, `/spec`, `/plan`, `/build`, `/test`, `/review`, `/code-simplify`, `/ship`, `/webperf`

Direct commands:

`/agent`, `/skill`, `/plugin`, `/file`, `/folder`, `/provider`, `/help`

Typing `/` opens keyboard-navigable completion showing source/provenance, required arguments, agent/skill association, and requested permissions. User commands may extend the registry, but reserved lifecycle names cannot be overridden and no command can self-grant authority.

## 8. Functional requirements

### Workspace, directories, files, editor, and Git

- Open through a native picker or recent list; opening alone runs no repository code.
- Show a cancellable, virtualized tree with explicit default ignores and an override UI.
- Read/create/rename/move/edit/delete files and directories, including empty directories, through proposals.
- Reject escapes involving `..`, symlinks, junctions, reparse points, hard links where detectable, alternate data streams, device namespaces, reserved Windows names, UNC/extended paths outside policy, case tricks, and root identity changes.
- Revalidate authorization immediately before execution; use handle-based/no-follow techniques where available and document residual same-user race risk.
- Detect encoding/BOM/line endings and external changes.
- Use Monaco for text and unified/side-by-side, file/hunk-selectable diffs.
- Apply multi-file changes as a **recoverably transactional** operation: write-ahead journal, workspace identity, base hashes, per-file temp/replace, durable outcome, rollback/recovery instructions, and explicit partial/recovery states. Do not claim cross-file filesystem atomicity.
- Harden Git inspection against repo-controlled helpers, optional locks, external diff/text conversion, hooks, filters, and submodule execution. Untrusted workspaces do not trigger Git automatically.

### Providers

MVP provider classes:

1. OpenAI official JavaScript SDK.
2. Anthropic official TypeScript SDK.
3. OpenRouter OpenAI-compatible API.
4. NVIDIA NIM OpenAI-compatible API.
5. User-configured loopback/local OpenAI-compatible endpoints.

The early vertical slice uses an offline fake provider plus one approved real adapter. Remaining providers are added after the proposal/approval loop works.

Each adapter exposes capabilities, model discovery or validated manual IDs, streaming, normalized tool requests, abort, connection diagnostics, usage, and normalized errors. Provider failure never silently resubmits content elsewhere.

Remote endpoints require HTTPS. Plain HTTP is allowed only for loopback. Redirects are disabled for credential-bearing/context-bearing requests. Base URL, resolved destination class, provider/model, and effective context are shown before send. Proxy, DNS/IP changes, IPv4/IPv6, timeouts, and response size limits are covered by policy and tests.

### Context and orchestration

Before send, the engine builds and displays a run manifest containing objective, destination, Soul, Role, Agent, Skills, tool schemas, system/runtime instructions, selected files, summaries, omissions/truncation, budget, and approval policy. Whole repositories are never silently uploaded. Agent runs have independent contexts and cancellation signals; the master merges structured reports.

### Proposals and approvals

All consequential app-mediated actions pass through one privileged broker introduced before editable configuration.

An approval is a single-use, expiring capability bound to a cryptographic digest of:

- normalized operation and arguments;
- workspace identity and resolved targets;
- relevant base/content hashes;
- executable or plugin ID/version/hash and instance;
- policy version, nonce, requester, and expiry.

Any drift invalidates approval. Package-script approval includes the exact package, version, lifecycle name, resolved script text/hash, and lockfile integrity. Remembered preferences may reduce prompts only for a deliberately bounded action class; they do not turn into reusable bearer grants.

### Terminal and tests

- Use ConPTY through a supervised pseudoterminal where supported.
- Approval shows exact executable resolution, arguments, cwd, environment-key names, PATH/PATHEXT implications, shell/profile behavior, timeout, reason, and package pre/post scripts.
- A launched command has the full authority of the current Windows user. Workspace scoping is a product policy, not OS containment, and the UI says so.
- Stream bounded output, preserve exit code, support cancellation/process-tree cleanup, and report that remote or detached effects may continue.
- Tests are detected but never auto-run because repository text asks for it.
- Git branch and commit are separately approved; push/reset/clean/deploy remain out of the initial loop.

### Plugins and MCP

- Metadata discovery occurs only in explicit locations and runs no entry point.
- Enabling an executable Node plugin or starting an MCP stdio server requires a full-authority trust warning and approval. Startup itself may cause side effects before tool discovery.
- Process separation provides fault isolation, not a security sandbox. Trusted executable code can directly access same-user files, processes, network, and environment outside Zenith's cooperative APIs.
- App-mediated plugin actions still use the central broker. Direct side effects of trusted executable code cannot be truthfully claimed as mediated.
- HTTP tools follow the same HTTPS/loopback and redirect policy as providers.
- Plugins are versioned, hash-identified, revocable, crash-limited, observable, and never receive plaintext app-managed credentials through the renderer.

## 9. Architecture

### Baseline

- Electron + TypeScript desktop application.
- React renderer.
- Electron Forge with Vite first; an ADR-defined Forge Webpack fallback if the pinned spike is unreliable.
- Zod or equivalent runtime validation at every IPC, manifest, provider, tool, and persistence boundary.
- Main process owns windows, trust, approvals, credentials, and coordination.
- Preload exposes a frozen narrow API.
- Renderer owns display and transient interaction state only.
- Supervised utility/child processes isolate storage, terminal, and trusted plugin failures where appropriate.
- Local SQLite state; Electron `safeStorage` for app-managed credentials; no plaintext fallback.

### Core interfaces

```ts
interface ProviderAdapter {
  readonly id: ProviderId;
  getCapabilities(): Promise<ProviderCapabilities>;
  listModels(signal: AbortSignal): Promise<ModelDescriptor[]>;
  stream(request: NormalizedRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
  testConnection(signal: AbortSignal): Promise<ConnectionDiagnostic>;
}
```

Shared contracts are process-neutral. Compiler configuration plus lint/boundary rules and negative tests prevent privileged imports from renderer code; aliases alone are insufficient.

## 10. Security, privacy, reliability, and observability

- Threat model and minimal approval architecture begin in M0–M1, not at release.
- App-managed state and logs remain under `%LOCALAPPDATA%\Zenith` with retention and deletion controls.
- No telemetry or cloud sync. Local diagnostics use allowlisted fields and redaction; they never dump all environment variables or unrestricted live output.
- Security guarantees cover app-mediated paths and app-managed credentials. Same-user processes and external providers remain capable of observing data they receive.
- Every consequential action records request/decision/outcome, timestamps, hashes, policy, and correlation IDs without secret values.
- Revocation, crash recovery, interrupted journals, offline providers, partial streams, external file conflicts, and plugin/PTY failures have visible states.
- Performance budgets are recorded against named Windows hardware and fixture profiles before optimization. Package size is measured only after an artifact exists.

## 11. Test strategy

- **Unit:** schemas, identifiers, command aliases, context budgeting, approvals/digests, redaction, path policy, provider normalization, state machines.
- **Integration:** IPC sender validation, preload allowlist, storage/migrations, fake provider, secure request policy, journaling/recovery, hardened Git, PTY cleanup, plugin/MCP fakes.
- **Component/accessibility:** landmarks, command completion, definition panes, diffs, approvals, focus, live regions, forced colors, zoom, reduced motion.
- **E2E:** actual Electron window with no native dialog dependency in M0; later critical project loop using controlled fixtures.
- **Security:** renderer privilege, CSP/navigation, path matrix, prompt injection, secret scans, approval replay/drift, executable trust, redirect/egress, package fuses.
- **Reproducibility:** fresh temporary checkout, frozen lockfile, scripts-disabled bootstrap/reviewed lifecycle policy, clean outputs, artifact hashes, and no development-path dependency.

RED/GREEN evidence records timestamp, command, expected/actual exit code, focused test, relevant tree state, and redacted log/artifact paths.

## 12. Acceptance criteria

The MVP release candidate is acceptable only when:

1. All 24 skills, four agents, seven references, and all 24 physical command artifacts are packaged intact and exposed as eight logical workflows with provenance.
2. Soul, Role, Agents, Skills, Commands, and Plugins are visible in the left rail and user definitions are manageable in-app.
3. Workspace access trust and workspace configuration trust are separate and revocable; untrusted config is inert.
4. Reserved lifecycle commands cannot be shadowed; agent recursion is prevented and visibly tested.
5. The master run visibly invokes an agent/skill, preserves dissent, and records effective context/egress.
6. The offline fake and all five MVP provider classes pass the same independent conformance suite; live tests are optional and require explicit credentials/network approval.
7. A temporary project completes the critical loop: open, trust, invoke, propose, approve, recoverably edit, approve test, inspect Git/output/audit, restart, reopen.
8. Approval replay, drift, path escape, forged IPC, renderer Node access, untrusted config activation, secret leakage, and silent network fail automated tests.
9. Plugin/MCP startup and terminal UI clearly warn about full current-user authority; app-mediated calls remain approved and audited.
10. No OmniRoute, voice capture, cloud sync, telemetry, deployment, or publishing path exists in MVP.
11. Keyboard-only, screen-reader smoke, 200% zoom, forced colors, reduced motion, contrast, and 320/768/1024/1440 layouts pass a recorded matrix.
12. The packaged Windows artifact is produced from a clean temporary checkout, has recorded SHA-256/architecture/unsigned state, passes package security checks, and contains no dependency on `D:\AI\skills\agent-skills`.
13. Every requirement links to dated evidence with command, exit code, Git/tree state, tool versions, lockfile hash, and redacted logs.
14. A final fresh-context review and the postponed Gemini CLI cross-model review are reconciled at G11 before release declaration.

## 13. Voice companion — post-MVP

The future companion is an optional tray/floating shell over the same run, approval, cancellation, context, and audit services. Start with push-to-talk, visible capture state, editable transcript, local STT/TTS preference, stop-speaking, and no voice-only approval for sensitive actions. Always-listening and wake phrase require a separate privacy/threat decision and remain off by default.

## 14. Approval record

- Product direction, name **Zenith**, local-first approach, and provider set: approved by the user.
- Skill-led planning and subsequent development: explicitly approved by the user.
- Three independent adversarial reviews: completed and reconciled into this version.
- Gemini CLI cross-model review: postponed by the user to final Gate G11.
- Version 0.3.0: implementation contract for the M0 work in `tasks/plan.md`.
