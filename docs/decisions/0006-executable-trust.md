# ADR 0006: Executable plugin, MCP, terminal, and script trust

**Status:** Accepted with explicit residual risk; G2 execution subset and M3 inert-discovery boundary frozen
**Date:** 2026-08-11

## Context

The requested product must run terminal commands and connect executable local plugins/MCP servers. A Node plugin, MCP stdio server, shell command, or package lifecycle script started under the logged-in Windows account can use that account's filesystem, processes, network, environment, and credentials. Electron utility/child process separation can contain crashes from the UI/main process but is not an operating-system security boundary.

Plugin/server startup itself may have side effects before any tool list or cooperative host API is available. Therefore “all tool calls are mediated” is true only for actions that use Zenith's APIs, not arbitrary direct actions taken by trusted executable code.

## Decision

### Discovery

- Search only explicit install directories or user-selected paths.
- Parse bounded manifest/definition metadata without importing modules, spawning entry points, running package scripts, or contacting endpoints.
- Declarative contributions can be previewed while disabled.

### M3 inert supplied and user definitions

M3 is a stricter subset of discovery: it makes definitions inspectable/manageable data and adds no executable startup path.

- Inventory/materialization handles regular files as bytes. It rejects traversal, absolute or escaping references, reparse points, duplicate/case-colliding normalized paths, missing/extra inventory, and any runtime fallback to the supplied development directory.
- Markdown front matter, TOML commands, JSON manifests/profiles, and any required YAML sidecars are parsed through bounded data-only adapters. Duplicate keys and ambiguous or executable YAML features (custom tags, anchors, aliases, merge keys) fail closed. No parser option may construct classes/functions, resolve environment variables, interpolate templates, load includes, fetch URLs, or invoke callbacks from content.
- Discovery never calls `import`, `require`, `eval`, `Function`, `vm`, a module loader, a hook registry, a package manager, a shell, `child_process`, `utilityProcess`, or network APIs using discovered content. Tests seed marker modules, hooks, scripts, plugin entrypoints, accessors, and network/process traps and require zero invocation/module-cache insertion/side effects.
- Skill scripts, shell files, hooks, assets, references, plugin entrypoints, interop metadata, and executable-looking Markdown remain immutable hashed bytes. UI may show their relative names, types, hashes, requested-permission warnings, and text previews where separately bounded; it cannot run them.
- Plugin discovery in M3 stops at validated manifest metadata. It neither resolves/loads an entrypoint nor discovers tools, connects MCP, supplies a secret, grants a permission, starts a process, or makes a network request. Plugin execution remains G8.
- Slash command definitions and source-specific aliases are preview/completion data only. Reserved lifecycle/direct names cannot be shadowed. Slash execution and agent/skill orchestration remain G6.
- Profile selection, enable flags, allowed-skill references, and semantic-gate prose do not grant authority. Prose is advisory. A future hard gate requires a separately specified, trusted, validated sidecar and later-gate execution contract.
- The fixed G2 provider/run/proposal/verifier/Git route does not read the M3 registry, selected profile, or definition content. An inertness test binds that separation through G3.

### Trust and startup

- Identify executable/plugin/server by normalized source, version, content hash, resolved executable path/hash, arguments, cwd, and requested environment-key names.
- Before first start and after identity drift, show a full-current-user-authority warning covering filesystem, processes, network, environment, credentials available to that user, and possible startup side effects.
- Startup requires a single-use approval capability. Remembered trust may identify the exact immutable package/version/hash but cannot approve changed code or arbitrary arguments.
- Pass only allowlisted environment values/opaque secret references through cooperative APIs. Do not claim this prevents same-user code from reading other accessible resources.

### Execution

- Prefer one supervised process per executable plugin for crash isolation, output bounding, health, stop, restart limits, and revocation.
- MCP stdio startup is an executable approval; tool discovery happens only afterward.
- MCP HTTP follows remote HTTPS/loopback-HTTP, redirects-off, timeout, size, and secret-ref policy.
- Cooperative tool calls become typed broker proposals bound to plugin instance/version/hash and exact arguments.
- Terminal/package-script approvals bind resolved executable/script content, cwd, environment-key names, lock/base hashes, nonce, expiry, and policy version.

### G2 fixed verification process

G2 does not introduce a shell, package-script runner, user command, PATH lookup, or repository-discovered executable. Its only test process is one bundled, immutable JavaScript verification module launched from main with Electron `utilityProcess.fork` after an exact proposal is approved.

- The proposal binds the packaged application identity, module path/hash, fixed empty argument vector, trusted workspace identity/cwd, selected-file base/intended hash, fixed environment-key allowlist, output budget, deadline, cancellation owner, and executor/policy versions.
- The module path must remain inside the packaged application boundary and match its build-time hash. Repository content cannot select/import a module, argument, dependency, executable, profile, or environment value.
- `stdin` is ignored; `stdout`/`stderr` are piped, byte/time bounded, decoded defensively, and treated as untrusted text. The process receives a freshly constructed minimal environment and no app-managed secret.
- The worker performs one fixed validation of the approved file and emits a versioned result. It has no cooperative provider/plugin/MCP authority and the renderer receives neither a process handle nor raw execution API.
- Timeout, owner cancellation, revocation, renderer loss, and app shutdown request termination and record the observed exit. A kill request is not described as reversal, containment, or proof that descendants/external effects stopped.

`utilityProcess` is Node-capable current-user code and can technically access the OS/network. G2's safety claim comes from immutable bundled code, a fixed proposal, bounded supervision, and tests—not from an OS sandbox.

T0068 implements this closed subset. The schema-v1 proposal, hard-coded packaged-module resolver, distinct schema-v2 process capability binding, freshly reauthorized workspace/file identity, requested-before-fork audit, direct empty-argument utility process, six-key environment, bounded pipes, timeout/cancel/overflow handling, and immutable verifier pass unit/integration/security checks. Exact Electron observes completed, cancelled, timed-out, and output-limit outcomes. T0069 adds only a main-retained review/status service and frozen propose/decide/getStatus/cancel preload. Its Tests panel presents exact identity, full-current-user warning, bounded textual output, exit code, and truthful cancel-requested/stopped states without exposing a process handle or generic executor. General commands, shells, package scripts, repository-selected modules, and renderer process authority remain absent.

### G2 hardened read-only Git

T0070 freezes this section's hostile fixture and denial matrix without adding production Git authority. The fixture uses a real repository and linked worktree, seeds repository/system/global helpers plus ambient Git injection, and binds byte-identical index/worktree/config canaries. T0071 turns those focused tests GREEN while keeping the renderer free of generic Git or process primitives.

Git inspection is a separate explicit user action bound to the absolute `git.exe` path/hash, exact built-in subcommand/arguments, workspace/cwd identity, environment-key allowlist, deadline/output limit, and one selected file. It is allowed only after workspace access trust and never runs automatically from repository content. The G2 read-only action does not require a single-use approval because it requests no mutation; its requested/terminal audit pair remains mandatory.

- Resolve and same-handle hash one canonical local `git.exe`, then rehash it immediately before and after each process. Invoke it directly with `shell: false`, bounded output, cancellation ownership, ignored stdin, and no PATH lookup at execution time.
- Permit one fixed `cat-file blob :<selected-path>` index-object read. Use `--no-optional-locks`, `--literal-pathspecs`, `GIT_NO_LAZY_FETCH`, `GIT_NO_REPLACE_OBJECTS`, disabled fsmonitor, no pager, a fresh environment, disabled system/global configuration, and disabled prompts.
- Obtain current text only through the existing same-handle workspace authorizer, compare the bounded index/current values in main, and create the selected-file unified diff inside Zenith.
- Never invoke worktree status/diff, aliases, remote helpers, submodules, hooks, filters, textconv, external diff, credentials, lazy object retrieval, or a mutating Git command. Repository configuration and attributes remain untrusted data.
- Hostile tests snapshot the index, selected worktree file, local/global/system configuration, optional lock, and helper marker before and after. Any observed test mutation is a security failure. The production UI says no write was requested; it does not claim to detect unrelated concurrent external changes.
- The Git binary still runs with full current-user authority. Exact path/hash binding detects drift but is not publisher/signature provenance, OS containment, or protection from a malicious already-selected executable or every same-user race.

### Revocation and disclosure

- Revocation stops app-started processes, invalidates approvals/context, closes handles where possible, and records outcomes.
- UI/docs continuously state that direct side effects may be irreversible and same-user code is not sandboxed.
- No marketplace, automatic update, or silent executable activation in MVP.

## Alternatives

- **Claim Electron utility-process sandboxing:** rejected as false for Node-capable same-user code.
- **In-process plugins:** rejected because a crash or global mutation can take down/corrupt the host.
- **Remove executable plugins from MVP:** rejected because plugin/MCP connectivity is an explicit user requirement; the guarantee is narrowed instead.
- **Container/VM every plugin:** stronger isolation but operationally heavy and outside the compact local MVP; may be explored later.
- **Approve every discovered tool automatically after plugin trust:** rejected because arguments/targets and identity drift still matter.

## Consequences

- Zenith provides informed trust, fault isolation, mediation for cooperative actions, audit, revocation, and drift detection—not containment.
- A trusted process can cause effects that no journal or cancel operation can undo.
- Plugin UX must lead with authority rather than hiding it in settings text.

## Primary sources

- Electron utility process (Node-capable): https://www.electronjs.org/docs/latest/api/utility-process
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron security checklist for untrusted content: https://www.electronjs.org/docs/latest/tutorial/security
- Electron ASAR read/execute caveats: https://www.electronjs.org/docs/latest/tutorial/asar-archives
- Node child processes: https://nodejs.org/docs/latest-v24.x/api/child_process.html
- Git global options and environment: https://git-scm.com/docs/git
- Git object inspection: https://git-scm.com/docs/git-cat-file
- Git status porcelain and optional-lock behavior: https://git-scm.com/docs/git-status
- Git diff external/textconv controls: https://git-scm.com/docs/diff-options
- Git configuration controls: https://git-scm.com/docs/git-config
- Model Context Protocol architecture: https://modelcontextprotocol.io/docs/learn/architecture
- npm lifecycle scripts: https://docs.npmjs.com/cli/v11/using-npm/scripts

## Revisit

At G2 after fixed-runner/Git hostile fixtures, at G3 after packaged inert-definition/marker proofs, before M7 general terminal, before M8 plugin/MCP implementation, and again at G10. Any stronger containment claim requires a separately proven OS boundary and new acceptance tests.
