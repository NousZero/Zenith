# ADR 0002: Electron process and module boundaries

**Status:** Accepted; M3 inert-definition boundary frozen
**Date:** 2026-08-11

## Context

Electron's main process has Node and native desktop authority. Renderer code behaves like web content unless Node privileges are explicitly enabled. Preload runs beside the renderer with elevated access and therefore becomes a high-value boundary. Utility/child processes can improve responsiveness and crash isolation but still have Node/current-user authority.

Zenith will render untrusted repository/model/plugin/terminal text. A renderer compromise must not directly become a filesystem, process, credential, or raw IPC capability.

## Decision

### Main process

Own application lifecycle, windows, session policy, workspace/config trust, approval capabilities, credential operations, and coordination. It validates IPC sender ownership and request/response schemas before dispatch.

### Preload

Expose a frozen, purpose-specific API through `contextBridge`. Never expose `ipcRenderer`, Electron modules, generic `invoke(channel, data)`, filesystem primitives, shell/process functions, environment values, or plaintext secret retrieval.

### Renderer

Own presentation and transient interaction state only. Configure `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`; deny navigation, new windows, downloads, unexpected permissions, insecure content, experimental Blink features, and remote executable content. Use a restrictive production CSP.

### M3 definition data path

- Build tooling may inventory and materialize the explicitly reviewed supplied source into a versioned application resource, but runtime never reads `D:\AI\skills\agent-skills` or any other development fallback.
- Main alone resolves the bundled snapshot, revalidates its versioned manifest, reads bounded bytes, parses legacy/modern metadata, constructs layered registries, evaluates workspace configuration trust, and owns user-library paths, definition journals, trash, imports, and exports.
- Parsing is data processing only. Main must not import/require a discovered module, evaluate templates, register hooks, spawn scripts, contact a network, start a plugin, or turn definition text into a G2 run capability.
- Preload exposes frozen purpose-specific definition list/get/validate/propose/decide/status methods only as each later RED/GREEN task authorizes them. It never exposes raw IPC, filesystem paths/handles, source-root selection, parser selection, capabilities, journals, executable entrypoints, or generic callbacks.
- Renderer owns accessible panes, filters, drafts, previews, collision/trust warnings, and transient validation display. Untrusted content is rendered as text; raw HTML and automatic link/navigation behavior are not allowed. Renderer drafts and remembered UI state never become effective definitions without main validation and, for a write, an exact approval.
- The effective registry is a main-owned immutable view with explicit bundled/user/workspace provenance. An untrusted workspace layer can be previewed but is excluded from the effective registry. Trust revocation invalidates cached effective views before any future run may consume them.
- M3 has no definition execution IPC or service. Agents, skills, slash commands, hooks, scripts, plugins, profiles, and semantic-gate prose remain inert; later gates must add separately reviewed typed authority.

### Utility and child processes

Use supervised processes only where storage, PTY, or trusted plugin work would block/crash main. Validate messages and bound queues/output. Treat this as fault isolation, not a security sandbox. A Node utility process can use Node APIs and has the user's operating-system authority.

### Enforcement

- Separate TypeScript configs/libs/types for main, preload, renderer, and shared contracts.
- ESLint/import-boundary rules block renderer imports from Electron/Node/main/preload/utility modules.
- Runtime IPC schemas and explicit channel registry.
- Negative tests that seed prohibited renderer imports and forged senders.
- Packaged security tests for CSP, fuses, navigation, sandbox, isolation, and Node absence.

Electron's process-specific TypeScript aliases aid type selection but are not runtime or architectural enforcement.

## Alternatives

- **Raw IPC bridge:** rejected because it lets renderer-controlled data select privileged channels.
- **Node-enabled renderer:** rejected because repository/model content would share direct OS authority.
- **Put all privileged work in main:** rejected for blocking/crash risk; small coordination remains in main while bounded services may be supervised separately.
- **Treat utility process as a sandbox:** rejected as technically false.

## Consequences

- New renderer capabilities require a typed end-to-end contract rather than importing a helper.
- More contracts/tests are required, but privilege review becomes tractable.
- Executable plugins/terminals remain outside a renderer compromise boundary only when started by main after explicit trust/approval; they are still same-user code.

## Primary sources

- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Context bridge API and copied/frozen values: https://www.electronjs.org/docs/latest/api/context-bridge
- Process sandboxing: https://www.electronjs.org/docs/latest/tutorial/sandbox
- IPC tutorial: https://www.electronjs.org/docs/latest/tutorial/ipc
- Security checklist, including IPC sender validation: https://www.electronjs.org/docs/latest/tutorial/security
- Utility process API: https://www.electronjs.org/docs/latest/api/utility-process

## Revisit

At G1 after the typed IPC/preload implementation and security abuse tests, and at G3 after exact-Electron definition-management proof. Any privilege expansion requires a new ADR or an explicit amendment with tests.
