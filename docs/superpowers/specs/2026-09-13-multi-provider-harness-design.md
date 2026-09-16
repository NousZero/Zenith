# Multi-Provider AI Harness — Design (v1)

**Status:** Approved by user, pending spec review
**Date:** 2026-09-13
**Supersedes:** The Agamemnon/Zenith ADR-gated workbench process (docs/decisions/0001-0007, PLAN.md, tasks/plan.md, tasks/todo.md). Those documents describe the prior direction and are retained for history but no longer govern new work.

## 1. Summary

Zenith becomes a cross-platform Electron desktop app: a harness for working with multiple AI providers side by side in one window. A user types one prompt, fans it out to several provider/model panes at once, and can then continue each pane's conversation independently. This replaces the previous Windows-only, ADR-gated, 176-task TDD workbench, which had drifted from what the user actually wanted.

## 2. Why the pivot

The prior Zenith build was a local-first **Windows-only** development workbench (file editing, Git, terminal, plugin/definition registry) governed by frozen ADRs and an 11-gate TDD process. The user's actual goal is simpler and different in kind: a lightweight, cross-platform multi-AI chat/comparison harness. Continuing the old process would mean reopening Windows-locked ADRs (0003) and retrofitting an unrelated product shape onto workbench infrastructure that doesn't serve it. Decision: reset in place (same repo/git history), cut the workbench-specific subsystems, keep only what's directly reusable, and rebuild with a lighter process (tests for real logic, no ADRs, no numbered gates).

## 3. What is reused vs. cut

**Reused (as a starting point, trimmed of workbench coupling):**
- Electron + Vite + React + TypeScript scaffold (`forge.config.ts`, `vite.*.config.ts`, `tsconfig*.json`) — already a working, cross-platform-capable build pipeline.
- `src/main/credential-store.ts` — `safeStorage`-backed encrypted credential storage. Already OS-keychain-backed per platform (Keychain/DPAPI/libsecret); needs its Windows-only workspace/path-authorization coupling removed, not its storage logic.
- The shape of `src/shared/contracts/normalized-provider.ts` as a starting point for the v1 provider adapter interface (trimmed of trust-gate/approval coupling).

**Cut entirely:**
- Trust/approval state machines, journaled file-apply executor, semantic gate classifier, definition library (Souls/Roles/Agents/Skills/Commands/Plugins/Profiles), audit/diagnostics layer, fixed-test-process runner, Git inspection service, offline run manifest.
- Windows-only workspace path authorization (drive-letter/UNC/ADS/reserved-name/junction handling) — v1 harness has no filesystem-workspace feature, so this has no purpose.
- ADR-driven, numbered-gate process itself (docs/decisions/*, PLAN.md's gate structure, tasks/plan.md, tasks/todo.md) — superseded by this spec and a normal implementation plan.

## 4. Provider adapter architecture

```ts
interface Model {
  id: string;
  label: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatChunk {
  delta: string;
  tokenCount?: number;
  done: boolean;
}

interface ProviderAdapter {
  id: string;                        // "openai", "anthropic", "openrouter", ...
  listModels(): Promise<Model[]>;
  sendMessage(req: {
    model: string;
    messages: ChatMessage[];
    signal?: AbortSignal;
  }): AsyncIterable<ChatChunk>;
  validateCredential(cred: string): Promise<boolean>;
}
```

- Each adapter is one file implementing this interface. v1 ships three: `openai.ts`, `anthropic.ts`, `openrouter.ts`.
- The adapter registry is a plain array/map in main-process code — no dynamic plugin loading, no runtime discovery. Adding a new provider (Copilot, opencode, others) later means adding one file and one registry entry; it does not require touching this interface. Dynamic/pluggable loading is explicitly deferred until a concrete need for runtime-installed adapters appears.
- Each adapter owns its own wire format internally (SSE parsing, request shaping) and yields normalized `ChatChunk`s. No shared wire-normalization layer in v1 — that abstraction only pays for itself once several adapters show real duplicated logic.
- Credentials are keyed by adapter `id` and stored via the reused credential store; never held in renderer or written to session JSON.

## 5. UI / interaction model

- Single window. Left rail lists panes; each pane is one provider+model pairing, user-nameable. Panes can be added or removed freely.
- Top of window: one shared prompt box, plus a global stat bar showing summed token usage across all currently-included panes for the active session.
- Each pane has an "included" checkbox. Sending the shared prompt appends it to every included pane's own message history and streams each pane's reply concurrently.
- After the fan-out, each pane is an independent conversation: replying inside one pane only affects that pane.
- Panes render as resizable side-by-side columns; when more panes exist than fit the window width, the pane row scrolls horizontally rather than forcing a tab switch, since side-by-side comparison is the point.
- Per-pane controls: provider/model dropdown, clear, delete, copy-response, and a small running token-count line (prompt+response tokens for that pane) near that pane's own input.
- Memory toggle per pane (see §7): controls whether that pane receives the session's memory-panel content as prepended context.

## 6. Sessions and persistence

- Multiple named sessions: user can create, save, load, switch between, and delete sessions. Each session owns its own set of panes, per-pane histories, and its own memory-panel text.
- Storage: one plain JSON file per session under Electron's `userData` directory. Write on change via `fs.writeFile`; read on load via `fs.readFile`. No SQLite, no migration framework, no write-ahead journal.
- Crash recovery is limited to "the last successfully written session file loads next launch." No conflict detection, no recovery UI — this is a deliberate simplification consistent with the "lighter process" decision; add durability machinery later only if data loss actually becomes a problem in practice.
- Credentials remain in the separate `safeStorage` credential store, never inside session JSON.

## 7. Memory (v1: manual; RAG deferred to v2)

- Each session has one persistent free-text memory/notes panel, saved as part of that session's JSON.
- Each pane has an on/off toggle: when on, the memory panel's current text is prepended as context to that pane's outgoing messages on the next fan-out send.
- No search, no embeddings, no automatic capture of conversation content into memory in v1 — the user writes what they want remembered.
- **v2 (separate future spec, not part of this implementation):** RAG-style cross-session memory — embeddings, an index, and retrieval-based search across sessions — replacing or augmenting this manual panel. Explicitly out of scope here because it is a distinct subsystem (embedding generation, vector index, retrieval pipeline) larger than the rest of v1 combined.

## 8. Packaging and cross-platform support

- `forge.config.ts` currently ships one maker: `MakerZIP({}, ["win32"])`. Replace with makers covering all three desktop platforms Electron supports: `MakerZIP` for win32, `MakerDMG` (or `MakerZIP`) for darwin, `MakerDeb`/`MakerRpm` (or `MakerZIP`) for linux.
- No platform-specific runtime logic is needed beyond packaging: `safeStorage` already resolves to the correct OS credential backend per platform, and cutting the Windows-only workspace path-authorization code (§3) removes the only genuinely Windows-locked logic in the app.
- No terminal/ConPTY work is included — out of scope for this app entirely, not deferred, not planned.

## 9. Process for implementation

- Tests are written for real logic: provider adapters (request shaping, chunk parsing, error handling), session persistence (save/load round-trip), and fan-out/memory-injection behavior. No ADR documents, no numbered gates/checkpoints, no adversarial-review ceremony.
- Working code first is acceptable where logic is trivial (UI wiring, simple pane CRUD); tests are added opportunistically there rather than up front.
- `docs/decisions/*`, `PLAN.md`, `tasks/plan.md`, and `tasks/todo.md` are superseded by this spec for anything going forward; they are not deleted (historical record) but are no longer the source of truth for scope or process.

## 10. Out of scope for v1 (explicit)

- RAG/embedding-based memory search (v2, see §7).
- Filesystem workspace browsing, file editing, diffs, Git integration, terminal.
- Definition registry (Souls/Roles/Agents/Skills/Commands/Plugins/Profiles).
- Cost estimation alongside token counts.
- Dynamic/pluggable provider loading (adapters are compiled-in files for v1).
- Provider adapters beyond OpenAI, Anthropic, OpenRouter (Copilot, opencode, others land later, same interface).
