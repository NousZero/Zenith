> **Historical document.** This describes the Windows-only Zenith development workbench, the
> product direction replaced on 2026-09-13 by the current desktop harness. It is kept as a record
> and is not maintained. For the current product see `PRD.md`, `README.md`, and
> `docs/superpowers/specs/2026-09-15-harness-features-roadmap.md`.

---

# Zenith Threat Model

**Status:** Accepted model through M4 provider-foundation threat review
**Date:** 2026-08-30
**Scope:** Local Windows desktop MVP described by `SPEC.md` 0.3.0

**M2 review:** G2 boundary refresh accepted on 2026-08-11; this section supersedes the initial M0-G2 label where the two differ.

**M3 review:** Definition/snapshot/parser/registry/write boundaries accepted on 2026-08-12. M3 may make definitions visible and manageable as inert data. It does not authorize definition execution, provider use, arbitrary workspace access, commands, hooks, scripts, plugins, MCP, or a change to the fixed G2 run.

**M4 review:** Provider egress, normalized-stream, SDK, credential-use, destination-resolution, and optional-live-smoke boundaries accepted on 2026-08-30. M4 may add one main-owned bounded provider request path and a selected-provider version of the existing one-file proposal loop. It does not authorize generic networking, proxy inheritance, hidden retry/redirect/fallback, environment credentials or endpoints, automatic tools, definition execution, broad workspace context, or a live call in default verification.

## 1. Security objective

Keep app-mediated authority visible, narrow, single-use, recoverable where possible, and auditable while being honest that approved same-user executables and remote providers remain outside Zenith's containment.

## 2. Assumptions and non-claims

- The Windows account and operating system are not already fully compromised.
- Zenith does not elevate privileges or provide a kernel/container/VM sandbox.
- Terminal commands, package scripts, executable plugins, and MCP stdio servers run with the current user's operating-system authority after explicit approval.
- A remote provider can retain/process data submitted to it according to its own service policy.
- Same-user processes can race files, inspect accessible storage/memory, and directly cause side effects outside cooperative host APIs.
- App-managed credential protection does not defend against arbitrary code already running as the same logged-in user.
- Cancellation cannot guarantee reversal or remote termination.

## 3. Assets

- Workspace files/directories, Git state, external user work, and recovery data.
- Global/workspace Soul, Role, Agent, Skill, Command, Plugin, and profile definitions.
- Workspace access/configuration trust and privileged grants.
- App-managed provider/plugin credentials and secret references.
- Provider-bound context, prompts, selected files, model responses, and tool proposals.
- Approval capabilities, policy versions, content/executable/plugin hashes, and audit records.
- Local SQLite state, migrations/backups, action journals, logs, diagnostics, and trash.
- Application code/package, preload/IPC bridge, supply-chain lockfile, and packaged assets.
- Terminal/plugin/MCP processes and their output/lifecycle.
- M2 offline run manifests, fake-provider events, one-file proposals/diffs, fixed-verifier output, and read-only Git context.
- The reviewed supplied-source snapshot, its byte/hash/path manifest, source version/commit/license/provenance, recursive references, and package placement.
- Parsed but inert definition metadata, original source bytes, validation findings, aliases, collisions, layer provenance, enable/selection state, and semantic-gate advisories.
- User definition library files, forks, imports/exports, base hashes, definition action journals, bounded trash, and restore metadata.
- Reserved lifecycle/direct command names and source-specific logical aliases whose identity must not be shadowed or rewritten.
- Provider catalog/selection state, exact adapter/model/capability snapshots, effective context previews, request-scoped connection plans, all-address DNS results, pinned socket destination facts, deadlines/budgets, normalized events, provider request IDs, and redacted request lifecycle audit.
- Official SDK package identities, dependency/license/lifecycle inventories, explicit client options, custom transport boundary, recorded protocol fixtures, and optional live-smoke approvals/results.

## 4. Threat actors and hostile inputs

- Malicious or compromised repository, including `.zenith`, Git config/attributes/hooks, symlinks/reparse points, package scripts, and filenames.
- Prompt injection in repository/model/web/plugin/terminal content.
- Compromised or malicious provider response/stream.
- Malicious plugin/MCP package or server.
- Renderer compromise through XSS or unsafe navigation/content.
- Dependency/package-registry compromise or lifecycle script.
- Concurrent same-user process modifying paths/files between check and use.
- Accidental user approval, misconfiguration, interruption, or secret paste.
- Honest provider/plugin/runtime failure producing ambiguous partial state.
- Hostile Git configuration/attributes and a replaced executable attempting helper, hook, filter, textconv, submodule, lazy-fetch, lock, prompt, or mutation side effects during a nominal read.
- Malicious supplied, imported, user, or workspace Markdown/TOML/JSON/YAML containing duplicate keys, unsafe tags/aliases, deep or oversized structures, invalid UTF-8/NUL, raw HTML/links, misleading Unicode, or executable-looking content.
- A replaced, incomplete, extra, link-bearing, case-colliding, or development-path-dependent supplied snapshot/package.
- A crafted definition path using traversal, absolute/UNC/device/extended namespaces, ADS, reserved names, trailing dot/space, reparse points, hardlinks, case folding, or Unicode confusables.
- External same-user edits racing snapshot reads, registry resolution, approval display, library publication, trash/restore, import, or export.
- A plugin manifest or skill/reference/script marker attempting side effects during inventory, discovery, parsing, preview, or diagnostic collection.
- A workspace profile or definition trying to activate itself, embed a grant, shadow a reserved command, reference a missing/disabled/colliding item, or affect a run before configuration trust.
- A malicious DNS answer, rebinding hostname, mixed public/private/loopback address set, alternate IP notation, IPv4-mapped IPv6 address, redirect, proxy setting, or same-user local listener trying to change the validated egress destination.
- Provider/SDK defaults or environment variables silently supplying a credential, base URL, custom header, proxy, log level, retry, redirect, fallback model, or additional upstream route.
- A provider returning malformed/out-of-order/unknown/oversized SSE, partial tool JSON, misleading usage/finish state, a 200-then-error stream, or sensitive response/error bodies and headers.
- A fixture, diagnostic, CI job, package smoke, or developer command accidentally becoming a live external provider request.

## 5. Trust boundaries

```text
untrusted workspace/model/plugin/terminal text
                    ↓ display/parse as data
renderer ── narrow typed IPC ──> main trust + approval broker
   │                                  │
   │ no Node/secret store             ├── local storage/credential service
   │                                  ├── workspace journal executor
   │                                  ├── provider network adapter
   │                                  └── approved current-user process/plugin/MCP
   │                                                       ↓
   └──────────────────── no containment guarantee ─ external OS/network effects
```

Additional boundaries:

- bundled/user definitions vs separately trusted workspace configuration;
- metadata-only plugin discovery vs executable startup;
- scripts-disabled dependency resolution vs explicitly approved lifecycle execution;
- local app state vs provider/plugin network egress;
- proposal display/edit vs single-use execution capability.
- reviewed development source vs the committed versioned bundled snapshot;
- read-only ASAR snapshot bytes vs main-owned bounded parsing and canonical contracts;
- bundled, user, untrusted-workspace-preview, and trusted-workspace-effective definition layers;
- renderer display/draft state vs main-owned definition identity, registry, privileged enable/trust state, approval, journal, and publication;
- metadata-only script/plugin discovery vs later-gate executable startup; and
- advisory prose checkpoints vs separately trusted, validated sidecar gate manifests.
- renderer-visible provider/model/context selection vs a main-owned immutable request snapshot and connection plan;
- opaque credential reference vs transient destination-bound secret use inside the privileged callback;
- canonical display origin vs all resolved addresses vs the one pinned socket peer;
- official SDK protocol shaping vs the app-owned DNS/socket/HTTP budget and redaction transport;
- provider response bytes vs normalized immutable events vs the existing untrusted one-file proposal;
- offline fixture conformance vs optional loopback live smoke vs separately approved external live use; and
- local-compatible loopback service authority vs the Zenith process and selected workspace context.

## 6. Threat/control/test register

| ID    | Threat / abuse case                                                                       | Planned control                                                                                                                                                                                                                                                                           | Required evidence / gate                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TM-01 | Renderer imports Node/Electron or sends arbitrary privileged IPC                          | Node disabled, sandbox/context isolation, frozen purpose-specific preload, sender/schema/channel validation, compiler+lint boundaries                                                                                                                                                     | RED/GREEN import and forged-sender tests; G0/G1                                                                                |
| TM-02 | XSS/remote navigation becomes desktop authority                                           | Local packaged UI, restrictive CSP, no remote executable content, navigation/new-window/download/permission denial                                                                                                                                                                        | Packaged CSP/navigation/security tests; G0/G1                                                                                  |
| TM-03 | Repository `.zenith` silently changes prompt/tools/grants                                 | Separate configuration trust; inert preview; grants only in privileged DB; reserved commands protected                                                                                                                                                                                    | Trust state-machine and untrusted-config E2E; G1/G3                                                                            |
| TM-04 | Model/repository text directly writes/runs/calls                                          | Treat as data; typed proposal; central broker; no natural-language execution                                                                                                                                                                                                              | Proposal parser/authorization abuse tests; G2/G6                                                                               |
| TM-05 | Approval replay or bait-and-switch                                                        | Single-use nonce/expiry; SHA-256 digest of normalized operation, identity, targets/base hashes, policy; edit/drift invalidation                                                                                                                                                           | Replay/drift/cross-workspace tests; G1/G2                                                                                      |
| TM-06 | Path escape or check/use race                                                             | Local-drive-only canonical root identity; hostile namespace/component matrix; component link inspection; realpath containment; opened-handle identity/base-hash revalidation; fail closed on ambiguity                                                                                    | Traversal/junction/reparse/hardlink/ADS/device/UNC/extended/case/root-drift/race tests; G2/G5                                  |
| TM-07 | Interrupted file update leaves hidden corruption                                          | G2 monotonic one-file journal before mutation; flushed same-directory replacement; base/intended hashes; explicit startup reconciliation; broader multi-file journal deferred                                                                                                             | Injected prepared/ready/applying interruption, third-hash conflict, restart, idempotence, and cleanup tests; G2/G5             |
| TM-08 | Delete loses unrecoverable work                                                           | Visible deletion diff, Git awareness, app trash/snapshot, retention and restore                                                                                                                                                                                                           | Delete/restore/no-Git tests; G5                                                                                                |
| TM-09 | Git read mutates/runs repo-controlled behavior                                            | Visible explicit read; fixed absolute Git identity; minimal environment; system/global config and prompts disabled; hazardous local config overridden; optional locks/lazy fetch/helpers/external diff/textconv/hooks/filters/submodules/protocols denied; before/after mutation snapshot | Hostile config/attributes/helper fixture, stable porcelain parser, index/ref/worktree hash checks, timeout/cancel tests; G2/G5 |
| TM-10 | Provider sends context to wrong/unsafe destination                                        | HTTPS remote, loopback HTTP only, redirects off, explicit base/destination/effective egress preview, no silent failover                                                                                                                                                                   | DNS/IP/redirect/proxy/v4/v6/failover fixtures; G4                                                                              |
| TM-11 | Provider stream/tool output gains authority                                               | G2 adapter is deterministic and has no network action; normalize bounded immutable events; tool-shaped output remains untrusted proposal input; abort stops local production without claiming external reversal                                                                           | Malformed/order/oversize/tool/cancel/no-network conformance tests; G2/G4/G6                                                    |
| TM-12 | App-managed credential leaks through renderer/log/context                                 | Transient input, one-shot IPC, safeStorage, opaque IDs, allowlisted diagnostics, redaction and seeded scans                                                                                                                                                                               | Renderer/log/snapshot/diagnostic scans and unavailable-encryption tests; G1/G4                                                 |
| TM-13 | npm install executes compromised lifecycle code                                           | Reject unsafe dependency protocols; `--ignore-scripts`; lock/integrity/script text/hash inventory; explicit user approval                                                                                                                                                                 | T0010–T0012 evidence; G0                                                                                                       |
| TM-14 | Bundled skill script executes during import                                               | Byte-intact metadata/reference validation only; no script import/exec                                                                                                                                                                                                                     | Marker fixture and packaged hash inventory; G3                                                                                 |
| TM-15 | Plugin code executes during discovery                                                     | Explicit source; bounded manifest parse only; no import/spawn/network                                                                                                                                                                                                                     | Malicious marker fixture; G8                                                                                                   |
| TM-16 | Plugin/MCP startup side-effects before tool discovery                                     | Full-authority identity warning and startup approval; supervised process; revocation                                                                                                                                                                                                      | Startup/identity drift/crash/revoke tests; G8                                                                                  |
| TM-17 | Trusted executable bypasses broker                                                        | Honest non-containment disclosure; broker claim scoped to cooperative calls; optional future stronger sandbox                                                                                                                                                                             | UI/document review and red-team fixture; G8/G10                                                                                |
| TM-18 | Terminal approval hides effective command                                                 | Resolve executable/path/hash, args, cwd, PATH/PATHEXT, profiles, env keys, package pre/main/post script contents                                                                                                                                                                          | Digest/display/replay/process-tree tests; G7                                                                                   |
| TM-19 | Cancellation shown as success while work continues                                        | Separate requested/local-stopped/remote-may-continue/completed/failed states; audit                                                                                                                                                                                                       | Provider/PTY/plugin cancellation fixtures; G4/G7/G8                                                                            |
| TM-20 | Logs/CI artifacts expose secrets/environment                                              | Allowlisted structured fields, bounded raw logs, redaction, restricted artifact paths, no environment dump                                                                                                                                                                                | Seeded secret scans; G0/G1/G10                                                                                                 |
| TM-21 | Definitions/source assets are silently rewritten or lost                                  | Byte-intact bundled snapshot, hash manifest, legacy adapters/sidecars, forks/trash                                                                                                                                                                                                        | Inventory/hash/restore tests; G3                                                                                               |
| TM-22 | Denial of service from huge tree/stream/output                                            | Size/time/count budgets, cancellation, virtualization, bounded queues/log rotation                                                                                                                                                                                                        | Large fixture/sustained stream/crash tests; G5/G9                                                                              |
| TM-23 | Migration or journal corruption blocks recovery                                           | Version check, pre-migration backup, durable states, validation, reset/export path                                                                                                                                                                                                        | Interrupted migration/restore/journal tests; G1/G10                                                                            |
| TM-24 | Voice creates alternate authority path                                                    | Voice post-MVP; same typed run/broker; sensitive approvals require visual UI                                                                                                                                                                                                              | Voice threat ADR and abuse E2E after G11                                                                                       |
| TM-25 | Supplied snapshot is incomplete, substituted, or runtime-coupled to the development tree  | Commit one byte-intact, versioned regular-file snapshot with normalized relative paths, per-file SHA-256, total inventory, provenance/license facts, recursive-reference validation, zero reparse entries, and no runtime fallback to `D:\AI\skills`                                      | Missing/extra/drift/link/case/package/source-absence tests and clean reproduction; T0082-T0087/G3                              |
| TM-26 | Definition parsing executes code or accepts ambiguous/bomb input                          | Main-owned bounded data parsing only; strict UTF-8/size/depth/count/schema limits; duplicate-key and unsafe YAML tag/anchor/alias/merge denial; no import/require/eval/template interpolation/process/network; preserve source bytes                                                      | Hostile parser/marker/accessor/depth/duplicate/encoding tests; T0088-T0092/G3                                                  |
| TM-27 | Layer collision or stale trust silently changes effective behavior                        | Stable normalized identity, explicit bundled/user/workspace provenance, visible collisions, untrusted workspace preview separated from effective registry, exact config-trust version/hash and revocation invalidation                                                                    | Precedence/collision/trust/restart/revocation tests; T0093-T0097/G3                                                            |
| TM-28 | User definition write/fork/trash/restore is redirected, replayed, or loses external work  | Controlled main-owned library roots, exact single-use approval, base/path/hash revalidation, same-directory flushed publication, monotonic journal, recoverable trash, restore conflict, no bundled mutation                                                                              | Path/race/replay/crash/restart/trash/restore tests; T0098-T0104/G3                                                             |
| TM-29 | Import/export escapes bounds, follows links, executes content, or leaks privileged state  | Main-owned picker; bounded regular file/tree only; no archives, reparse following, script execution, overwrite by default, grants/capabilities/journals in exports, or renderer raw path; exact destination approval                                                                      | Hostile tree/link/archive/cancel/conflict/round-trip/outside-canary tests; T0102-T0104/G3                                      |
| TM-30 | Command alias or Unicode/case collision shadows a protected operation                     | Stable logical command IDs, source alias provenance, normalized display/collision keys, reserved lifecycle/direct namespace that no layer can shadow, preview-only slash completion                                                                                                       | Alias/reserved/confusable/collision and zero-execution tests; T0105-T0107/G3                                                   |
| TM-31 | Skill script, hook, plugin entrypoint, or manifest side effect runs during M3 discovery   | All scripts/hooks/entrypoints are inert bytes with warnings and hashes; plugin contribution is bounded manifest metadata only; no import/spawn/network/permission grant/tool discovery                                                                                                    | Marker/network/process/module-cache tests in source and package; T0082-T0097, T0116-T0124/G3                                   |
| TM-32 | Renderer content injection becomes definition or desktop authority                        | React text rendering, no raw HTML, restrictive CSP/navigation, frozen purpose-specific preload, main schema/sender validation, renderer receives redacted immutable views and never handles filesystem paths/capabilities                                                                 | XSS/HTML/link/forged IPC/renderer-retention tests; T0079-T0134/G3                                                              |
| TM-33 | Profile or semantic-gate prose grants hidden authority                                    | Profiles reference validated IDs only and show missing/disabled/colliding states; enable/trust/grants stay privileged; prose checkpoints are advisory; only a separately trusted validated sidecar may become a later hard gate                                                           | Profile/gate/grant-in-file/inert-run tests; T0120-T0127/G3                                                                     |
| TM-34 | DNS rebinding, mixed answers, or alternate IP notation bypasses destination policy        | Canonical URL parsing; `net.isIP` classification including mapped forms; OS-semantic all-address lookup; deny mixed/forbidden classes; freeze one request-scoped plan; custom lookup/connect pins an approved address and revalidates the actual peer before bytes/credential use         | Unit/property DNS/IP matrix, rebinding and peer-drift fake servers, IPv4/IPv6 exact Electron; T0145-T0148/G4                   |
| TM-35 | SDK/env/proxy defaults cause hidden egress, retries, headers, or secret/body logging      | Exact SDK pins; scripts-disabled install; explicit key/base/timeout/custom fetch; `maxRetries: 0`; logging off; no environment-derived credential/base/header/log/proxy; no SDK auto-tool helper; direct app transport only                                                               | Dependency/source audit, environment/proxy canaries, retry/log traps, fake transport conformance; T0162-T0169/G4               |
| TM-36 | Provider/router silently changes model, upstream, region, retention, or resubmits context | One model per request; app retry zero; redirects off; no provider switching; OpenRouter `allow_fallbacks: false`, no `models` fallback list, visible bounded routing/data-policy facts; server-side routing never mislabeled as a fixed upstream                                          | Routing/fallback/header fixtures, destination audit, exact Electron selection review; T0170-T0172/G4                           |
| TM-37 | Malformed or ambiguous stream creates false success, tool authority, or unbounded state   | Independent normalized state machine; strict order/identity/UTF-8/JSON/SSE/content-type/count/byte/deadline budgets; terminal outcome once; provider-specific mid-stream errors; unknown events bounded; tool data inert and exact-schema only                                            | Common plus per-provider malformed/order/partial/error/oversize/late-event conformance twice; T0139-T0176/G4                   |
| TM-38 | Default test, diagnostic, package, or reproduction unexpectedly makes a live call         | Offline fixtures and loopback servers only; network-denial traps; no credential required; optional live command absent from default/CI/package/reproduction and denied without exact endpoint/model/network/context/credential approval                                                   | Static script audit, external socket trap, live-denial tests, package/reproduction observation; T0144/T0160/T0193-T0195/G4     |
| TM-39 | Secret crosses destination/request boundary or survives in renderer, SDK, error, or log   | Opaque main-owned credential reference; exact provider+origin binding; decrypt only inside one request callback after destination revalidation; transient header construction; structural allowlist audit; seeded secret scans; no SDK/client/error object crosses boundary               | Cross-provider/origin/replay/concurrency/restart and renderer/log/audit/diagnostic/package scans; T0151-T0154/G4               |
| TM-40 | Provider dependency or protocol drift invalidates reviewed behavior                       | Exact registry pins/integrities/licenses; lifecycle scripts disabled; dependency graph and protocol fixtures recorded; explicit capability versioning; unsupported events/features fail closed or become bounded diagnostics; package and fresh-tree reproduction before G4               | Registry-only audit, offline reinstall, import/package spike, fixture drift review, fresh reproduction; T0162-T0163/T0194/G4   |
| TM-41 | Credential-free local-compatible endpoint becomes generic SSRF or local-service authority | Explicit user base only; HTTP permitted only when every resolved and connected address is loopback; no credentials/custom auth/proxy/redirect; fixed compatible paths/methods/content types; selected context preview; service output remains untrusted; no discovery scan                | Host/path/userinfo/query/mixed-address/listener-race tests and optional explicit loopback smoke; T0155-T0161/G4                |

### G2 constrained proof boundaries

| M2 capability           | Authorized surface                                                                                                         | Required denials and invariants                                                                                                                                                                                     | Owner / first proof                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Workspace open/read     | One explicit local-drive root and one existing bounded regular text file; main owns canonical facts and the opened handle  | Absolute/parent/UNC/device/extended/ADS/reserved/trailing-dot-space/binary/oversize paths; link/junction/reparse traversal; hardlink ambiguity; root/target/base-hash drift; renderer receives no filesystem handle | Main workspace authorizer / T0052-T0056 |
| Offline fake provider   | In-process deterministic bounded event generator using caller-supplied text only                                           | No network call/imported adapter, credential, filesystem, process, or direct tool execution; malformed ordering and late events denied; abort is terminal locally                                                   | Main provider adapter / T0057-T0058     |
| Run manifest            | One local run identity, workspace/file/provider snapshot, lifecycle state, and bounded event counts                        | No prompt/file body/credential/capability nonce; no authority encoded in manifest; stale owner/workspace events denied                                                                                              | Main run service / T0059-T0060          |
| One-file proposal/apply | One validated text replacement with visible diff, exact base/intended hashes, single-use capability, and monotonic journal | Extra/absolute targets, base/identity/digest drift, replay, wrong owner/executor, mutation before `prepared`, third-hash recovery overwrite, silent partial success                                                 | Broker + file executor / T0061-T0066    |
| Fixed verifier          | One immutable bundled utility module/hash, empty arguments, trusted cwd, minimal environment, bounded output/deadline      | No shell, PATH lookup, repository module/script/package command, stdin, secrets, renderer handle, unbounded output, or success after timeout/cancel; full-current-user warning remains visible                      | Main process supervisor / T0067-T0069   |
| Read-only Git           | Explicit approved official `git.exe` identity with fixed status/diff forms                                                 | No automatic invocation, alias/remote/submodule/hook/filter/helper/textconv/external diff/protocol/lazy fetch/prompt/optional lock/mutating command; no index/ref/worktree mutation                                 | Main Git reader / T0070-T0071           |
| Audit/diagnostics/UI    | Bounded structural statuses and redacted lifecycle evidence                                                                | No path, content, prompt, diff, output, credential, environment, nonce, or raw journal disclosure; no renderer-retained privileged material                                                                         | Main services + renderer / T0072-T0076  |

T0052 may begin because each M2 asset, actor, denial case, owner, and first proof is mapped. The safe fallback for an unsupported Windows identity/reparse fact is denial. No critical/high unknown is accepted as an implementation assumption.

### G3 constrained definition boundaries

| M3 boundary                         | Authorized data flow                                                                                                        | Owner and fail-closed controls                                                                                                                               | Recovery / audit / proof                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed source -> bundled snapshot | One reviewed versioned non-`.git` regular-file tree becomes immutable application data                                      | Build-time inventory/materializer; normalized relative paths, byte/hash manifest, no links/reparse/fallback, exact provenance                                | Rebuild from reviewed source; package and fresh-tree byte audit; T0082-T0087                                                                   |
| Snapshot -> canonical definitions   | Bounded files become immutable metadata views plus original bytes/findings                                                  | Main parser/adapters; strict schemas and budgets; duplicate/unsafe YAML features denied; no module import, script, process, network, or write                | Reject the item without partial registry insertion; aggregate redacted finding; T0088-T0092                                                    |
| Bundled/user/workspace -> registry  | Read-only bundled and controlled user definitions are visible; workspace items remain preview-only until exact config trust | Main registry/trust service; stable identity, provenance, visible collision, reserved namespace, config-trust version/hash, revocation invalidation          | Rebuild from source layers; preserve conflicts as visible inactive records; audit counts/state only; T0093-T0097                               |
| Renderer draft -> user library      | A validated create/update/fork/lifecycle/import/export proposal may request one exact write/move/copy                       | Main definition store plus approval broker; controlled root/destination, base/hash/path/owner/policy binding, single-use capability, no raw path in renderer | Durable journal, same-directory publication, bounded trash, conflict/save-copy/manual recovery; redacted requested/terminal audit; T0098-T0104 |
| Commands/profiles/panes -> preview  | Definitions, aliases, assignments, script/reference warnings, plugin manifests, and gate prose can be inspected and managed | Renderer owns presentation only; main returns frozen redacted views; protected names and missing/disabled/colliding references remain explicit               | Reload/rebuild from authoritative files; no run/execution authority or G2 manifest influence; T0105-T0127                                      |
| Metadata -> future execution        | None in M3                                                                                                                  | Main denies agent/skill/command/hook/script/plugin/profile execution, provider calls, terminal, MCP, arbitrary Git/file mutation, and G2 run alteration      | Attempts are rejected/audited structurally; later gates G4/G5/G6/G7/G8 own any authority; T0125-T0134                                          |

M3 starts only with documentation and RED/GREEN data-boundary tasks. Unsupported parser semantics, path identity, snapshot provenance, or recovery postconditions fail closed. There is no accepted critical/high M3 uncertainty and no M3 definition is executable.

### G4 constrained provider boundaries

| M4 boundary                            | Authorized data flow                                                                                                      | Owner and fail-closed controls                                                                                                                                                 | Recovery / audit / proof                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection -> request snapshot          | One explicit provider, model, destination class, bounded effective context, and capabilities become an immutable run fact | Main provider catalog/run service; exact identity/version revalidation; stale/missing/disabled/drifted selection denies; renderer holds no network/credential object           | Refresh and re-review only; requested/denied lifecycle audit; catalog/selection fixtures and exact Electron; T0177-T0186                                  |
| Snapshot -> connection plan            | One known remote origin or explicit credential-free loopback base becomes one canonical path/address/deadline plan        | Main destination policy; HTTPS remote fixed origins; loopback-only HTTP; all-address classification, mixed-class denial, pinned lookup/peer, redirects/proxy/retries off       | Abort before egress on ambiguity/drift; redacted reason and destination class; DNS/IP/redirect/proxy/rebind matrix; T0145-T0150                           |
| Credential ID -> outbound auth header  | One destination-bound secret is transiently inserted for one matching remote request                                      | Main credential store callback plus transport; decrypt after exact provider/origin/plan checks; no local credential; no renderer/SDK retention; structural redaction           | Fail without call; revoke/update through existing vault; requested/terminal audit and seeded scans; T0151-T0154                                           |
| SDK/adapter -> app transport           | An adapter may shape one reviewed protocol request and receive one bounded response stream                                | Main adapter only; exact SDK options and custom fetch; environment/retry/logging/auto-tool disabled; fixed path/header policy; no raw SDK object crosses adapter               | Typed normalized error; socket destroyed; fixtures remain source of truth; dependency and adapter conformance; T0162-T0176                                |
| Socket bytes -> normalized events      | Bounded SSE/JSON becomes immutable start/text/tool/usage/error/completion facts                                           | Main transport/parser/conformance state machine; strict byte/count/time/order/terminal budgets; unknown/provider errors bounded; late events discarded after terminal          | Abort/destroy/cleanup; exact local-vs-remote cancellation state; common and provider matrices twice; T0139-T0176                                          |
| Tool-shaped event -> one-file proposal | Exact schema-compatible text replacement may enter the existing selected-file proposal validator                          | Existing proposal service, approval broker, and journal remain the sole mutation path; no automatic/provider/SDK tool execution; definitions stay inert                        | Reject malformed/wrong-target/stale output; existing rollback/recovery/audit; provider-backed one-file E2E; T0187-T0192                                   |
| Models/diagnostics -> renderer         | Bounded model/capability/connection/status/request-ID fragments may be displayed                                          | Main returns frozen allowlisted path/secret/body-free views over narrow IPC; no base mutation, fetch, socket, credential, raw error/header/body, or general request port       | Refresh/retry is explicit and bounded; malformed data isolated; renderer/IPC/security/package tests; T0177-T0194                                          |
| Optional live command -> endpoint      | Only an exact separately approved loopback or external diagnostic may make a real request                                 | Dedicated non-default command; explicit endpoint/model/network/context/credential approval; no automatic CI/test/package/reproduction invocation; same transport and redaction | User-visible cancel/terminal state; no success claim without response; live result is optional evidence only; denial/static/socket tests; T0160/G4 review |

Every M4 boundary has a main-process owner, an explicit denial outcome, a cleanup or recovery path, a named fixture/Electron proof, and a recorded residual-risk statement in `tasks/evidence/m4-threat-source-refresh.md`. There is no accepted critical/high unknown or unowned M4 authority. If address identity, protocol compatibility, SDK control, credential binding, or terminal stream state cannot be proven, the safe behavior is no egress or a failed run—not fallback.

## 7. Approval-sensitive operations

Always require an exact proposal/approval in MVP:

- activating workspace-owned configuration;
- writing, renaming, moving, or deleting files/directories;
- applying configuration/definition edits;
- sending selected context to a provider when the destination/config changed or policy requires confirmation;
- starting terminal/package/Git mutation processes;
- enabling or starting executable plugins/MCP servers;
- cooperative plugin/MCP tool calls with consequential effects;
- secret creation/update/use by a newly identified destination;
- branch/commit and data reset/restore.

No Markdown, provider output, plugin manifest, or remembered UI preference contains a reusable bearer grant.

## 8. Residual risks accepted for MVP

- Same-user executable code can directly access resources and bypass cooperative APIs after the user trusts/starts it.
- Windows filesystem authorization cannot eliminate every race against another same-user process; revalidation and handle-based techniques reduce but do not erase it.
- Transient credential text passes through renderer input before narrow IPC and clearing.
- A provider may continue work after the client aborts and may apply its own retention policy.
- A local-compatible loopback service is a separate same-user process outside Zenith's containment and can retain any context explicitly sent to it.
- OpenRouter is the approved network destination but can route within its service; disabling fallbacks prevents backup attempts, not every provider-side implementation choice. Zenith must display routing/data-policy facts and must not claim an upstream identity it cannot prove.
- Provider APIs, model behavior, SDKs, and model catalogs may change after fixture review. Unsupported changes fail visibly; optional live evidence does not turn remote behavior into a containment guarantee.
- Proxy-dependent networks are unsupported in M4. Zenith does not inherit environment or system proxy configuration; a required proxy therefore produces a visible connection failure.
- Approved external/process effects may not be reversible by journal or cancellation.
- An unsigned private Windows build produces reputation warnings and is not ready for public distribution.

## 9. Review cadence

- M0: validate shell/supply-chain/package boundaries.
- G1: review IPC/trust/approval/credential/state implementation.
- G2: red-team the first complete offline loop.
- G3: re-review snapshot/parser/registry/definition-lifecycle inertness and package provenance.
- G4: review provider destination/credential/transport/adapters, double conformance, package boundary, and fresh reproduction.
- G5: re-review Windows path/journal/Git boundaries.
- G8: re-review plugins/MCP and authority disclosures.
- G10: refresh this model against the implemented product and resolve all critical/high findings.
- G11: fresh-context plus postponed Gemini CLI cross-model review before release declaration.

## 10. Source anchors

- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron context bridge: https://www.electronjs.org/docs/latest/api/context-bridge
- Electron ASAR archives and integrity: https://www.electronjs.org/docs/latest/tutorial/asar-archives and https://www.electronjs.org/docs/latest/tutorial/asar-integrity
- Electron Forge build hooks: https://www.electronforge.io/config/hooks
- Electron safeStorage semantics: https://www.electronjs.org/docs/latest/api/safe-storage
- Windows file naming/namespaces: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
- Windows reparse points: https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points
- Windows hard links and junctions: https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions
- Node file handles and filesystem APIs: https://nodejs.org/docs/latest-v24.x/api/fs.html
- Electron utility process: https://www.electronjs.org/docs/latest/api/utility-process
- Git status and optional-lock behavior: https://git-scm.com/docs/git-status
- Git diff execution controls: https://git-scm.com/docs/diff-options
- npm lifecycle scripts: https://docs.npmjs.com/cli/v11/using-npm/scripts
- YAML 1.2.2 specification: https://yaml.org/spec/1.2.2/
- TOML 1.0.0 specification: https://toml.io/en/v1.0.0
- Model Context Protocol architecture: https://modelcontextprotocol.io/docs/learn/architecture
- OpenAI Responses streaming: https://developers.openai.com/api/docs/guides/streaming-responses
- OpenAI function calling: https://developers.openai.com/api/docs/guides/function-calling
- OpenAI JavaScript SDK configuration: https://github.com/openai/openai-node/blob/main/docs/configuration.md
- Anthropic Messages streaming: https://platform.claude.com/docs/en/build-with-claude/streaming
- Anthropic API errors: https://platform.claude.com/docs/en/api/errors
- Anthropic TypeScript SDK client controls: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts
- OpenRouter provider routing: https://openrouter.ai/docs/guides/routing/provider-selection
- NVIDIA hosted NIM API reference: https://docs.api.nvidia.com/nim/reference/meta-llama-3_1-8b-infer
- NVIDIA NIM LLM API reference: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html
- Node 24 DNS, HTTP, and network APIs: https://nodejs.org/download/release/latest-v24.x/docs/api/dns.html, https://nodejs.org/download/release/latest-v24.x/docs/api/http.html, and https://nodejs.org/download/release/latest-v24.x/docs/api/net.html
