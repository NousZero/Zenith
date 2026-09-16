# M4 Development Journal

- **Milestone:** M4 / Gate G4 — provider foundation and expansion
- **Journal opened:** 2026-08-30 (Asia/Tokyo)
- **Inherited gate:** G3 GREEN for the verified local technical boundary
- **Status:** T0135-T0158 and checkpoint M4.C complete
- **Current action:** T0159 local-compatible conformance/failure-isolation proof

## Purpose and update rules

This is the resumable record for M4 planning and development. It records verified
scope, protocol/security decisions, RED/GREEN outcomes, exact commands and counts,
network/credential claims, evidence, previews, limitations, and the unique next
task. It does not replace `SPEC.md`, `PLAN.md`, `tasks/plan.md`, `tasks/todo.md`,
the threat model, or gate evidence.

- Only verified results are recorded as complete.
- Fixture conformance, optional live smoke, and actual live provider use are
  always distinguished.
- Default tests, CI, packaging, and reproduction use loopback fixtures only and
  require no credential or external network.
- Every completed phase records provider/destination/credential authority,
  request/retry/redirect/proxy/cancel policy, redaction, socket/process/temp
  cleanup, full verification, exact Electron, and a fresh preview.
- The user owns Git staging, commits, pushes, tags, releases, and remote mutation.
- Gemini CLI remains postponed to G11; OmniRoute remains excluded.

## Inherited state

Gates G0-G3 are GREEN. Zenith has a hardened Electron shell, typed owner-bound
IPC, single-use approvals, separate trust, encrypted destination-bound credential
storage, redacted audit/diagnostics, a reproducible one-file offline proposal and
approved edit/test/Git loop, and a complete manageable-but-inert definition
studio. The G3 unsigned 76-file/365,930,248-byte package launches and reproduces
byte-for-byte at the unpacked boundary.

The existing network-free fake provider emits one deterministic bounded
start/delta/tool-proposal/usage/completed sequence. The existing run manifest is
fixed to that offline destination. The credential vault accepts only OpenAI,
Anthropic, OpenRouter, and NVIDIA remote HTTPS origins and decrypts secrets only
inside a main-retained callback. No real provider adapter, SDK dependency,
production socket/DNS transport, provider catalog/selection, model discovery, or
provider-run renderer route exists.

## M4 authority boundary

M4 may add one main-owned bounded provider network path and selected-provider
version of the existing one-file loop. It may not add general networking,
environment credentials, hidden retries/redirects/proxies/fallback, automatic
tool execution, definition execution, broad workspace context, generic process or
Git mutation, Plugin/MCP runtime, OmniRoute, Gemini CLI, or voice.

Remote provider data retention and remote cancellation are outside Zenith's
containment. The app must display the destination and effective context before
send, audit the request before egress, expose truthful cancellation states, and
never claim that local abort reversed remote processing.

### 2026-08-30 — T0135 M4 atomic plan GREEN

**State:** PLAN M4.1-M4.9 is mapped to T0135-T0195: 61 contiguous tasks and eight
checkpoints. Contract/conformance precede network code; secure request policy
precedes adapters; the credential-free local-compatible adapter is first; remote
SDKs are separately audited and pinned with scripts disabled; provider settings
precede visible run integration; package and fresh reproduction precede Gate G4.

**Primary-source decisions:** Current official OpenAI and Anthropic SDK docs show
automatic retries, long defaults, environment defaults, custom fetch, typed
errors/request IDs, and body-sensitive debug logging; M4 disables retries/logging
and routes SDK requests only through the app-owned secure transport. OpenRouter
documents fallback enabled by default; M4 sends `allow_fallbacks: false` and never
supplies fallback models. NVIDIA documents current OpenAI-compatible
Chat/Responses streaming/tools/models plus readiness. Node 24 primary docs ground
all-address DNS, AbortSignal destruction, finite HTTP limits, and IP controls.

**Plan audit:** 195 total unique task headings; M4 has 61/61 contiguous IDs,
61/61 complete required field sets, 61/61 todo parity, zero missing/forward
dependency reference, and one next task T0136.

**Verification:** Isolated `npm run verify` passes 234 unit, 186 integration, 65
component, and 260 active security tests with three designed package-context
skips. Standalone diagnostics exits zero. Exact Electron 43.3.0 app-shell passes
1/1 with one worker and zero retries in 15.4 seconds test time / 16.5 seconds
total. A prior concurrent verification attempt hit only the diagnostics unit
test's five-second timeout while standalone diagnostics ran beside it; the
unaltered isolated rerun passes and is the recorded result.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0135-m4-atomic-provider-plan-green.png` is a
fresh real-Electron 2250x1406 image, 208,005 bytes, SHA-256
`18C6723143FA5A465C41055686114DD925672614379D629310CC42539FF924BD`.
It is visually crisp and unclipped and byte-identical to the latest preview.
Electron/Zenith process residue is zero. The same eight disclosed older/failed
temporary roots remain; no fresh root survived this phase. `package-lock.json`
remains 349,335 bytes at SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** No dependency install, lock/source/runtime change,
credential use, provider/fake-server/live network call, IPC/preload/UI change, Git
operation, package/release, or new authority occurred.

**Next task:** T0136 only — refresh the M4 threat model, provider ADR, and current
primary-source boundaries before contract or transport code.

### 2026-08-30 — T0136 M4 threat/source refresh GREEN

**State:** The accepted threat model now includes the M4 review, M4 assets/actors
and trust boundaries, TM-34-TM-41, an eight-row G4 constrained boundary table,
new residual risks, a G4 review cadence, and current provider/runtime anchors.
ADR 0005 now binds all adapters to one main-owned secure transport and freezes
fixed remote origins, credential-free loopback-only explicit bases, all-address
classification and pinned-peer verification, finite budgets, no redirects,
proxy inheritance, retries, fallback, environment defaults, SDK logging, or
automatic tools.

**Sources and ownership:** Twelve current official OpenAI, Anthropic, OpenRouter,
NVIDIA, and Node pages support the five-class source matrix. The 15-row M4
asset/actor/boundary matrix maps every item to a control/owner,
denial/recovery, named proof, and residual risk. Ten requirement groups have a
unique owner and safe fallback. No critical/high M4 requirement is unknown or
unowned; uncertainty means no egress or a failed run, never a hidden switch.

**Verification:** Final isolated source verification is 234 unit, 186
integration, 65 component, and 260 active security passes plus three designed
skips. Diagnostics exits zero with safeStorage available. Exact Electron 43.3.0
app-shell passes 1/1 with one worker/zero retries in 15.8 seconds test time / 16.9
seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0136-m4-threat-source-refresh-green.png` is a
fresh 2250x1406 real-Electron capture, 208,005 bytes, SHA-256
`18C6723143FA5A465C41055686114DD925672614379D629310CC42539FF924BD`,
visually clean and unclipped. Electron/Zenith processes and fresh temporary
roots are zero; the same eight disclosed older/failed roots remain unchanged.
The lock remains 349,335 bytes at SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** No credential creation/decryption/use; provider, fake-server,
loopback, proxy, DNS-test, or external live request; dependency/source/runtime,
IPC/UI, Git, package, signing, or release mutation occurred.

**Next task:** T0137 only — freeze the inherited provider, manifest/proposal,
credential, IPC/cancellation, audit, and renderer seams with characterization
tests before refactoring.

### 2026-08-30 — T0137 inherited provider seams GREEN

**State:** Four tests-only characterization files freeze the public offline
provider request/event budgets, essential G2 manifest and exact one-file proposal
fields, provider-and-origin-bound secret consumption, rejection-safe transient
credential input, secret-free audit drafts, renderer non-authority, and absence
of generic provider/network/credential-read routes. The fake provider, manifest,
and proposal source path retains zero SDK/network/environment/credential
authority. Production behavior is unchanged.

**Focused and inherited proof:** The four new files pass 12/12: three unit, two
integration, five component, and two security cases. A separate five-file
inherited integration bundle passes 19/19 and names the complete
manifest/proposal services, credential store, IPC owner/cross-owner cancellation
with late-result suppression, and offline pre/during-stream abort behavior.
Wrong provider and wrong origin both deny before decrypt; the exact reference is
decrypted once only inside the main-owned consumer callback.

**Verification:** Final uninterrupted `npm run verify` passes 237 unit, 188
integration, 70 component, and 262 active security checks plus three designed
skips. Diagnostics exits zero. Exact Electron 43.3.0 app-shell passes 1/1 with
one worker/zero retries in 17.6 seconds test time / 18.7 seconds total. One first
aggregate attempt hit only the inherited diagnostics five-second unit timeout
and that file passed 2/2 in isolation. A later aggregate attempt hit only the
known inherited fixed-process fake-launch scheduling race and that file passed
5/5 in isolation. Subsequent complete runs passed without production changes.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0137-m4-inherited-provider-seams-green.png` is a
fresh 2250x1406 real-Electron capture, 208,005 bytes, SHA-256
`18C6723143FA5A465C41055686114DD925672614379D629310CC42539FF924BD`,
visually clean/unclipped and byte-identical to the latest preview. Final
Electron/Zenith process, isolated M4-seam temp root, and controlled-root marker
counts are zero; no app-owned listener/socket remains after clean close. The same
eight disclosed older/failed roots remain unchanged. The lock remains 349,335
bytes at SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** The only credential write was a canary in isolated
fake-encryption test storage and it was removed. No production/app-owned or real
credential, dependency, production source/runtime, SDK/adapter, IPC/UI route,
network/DNS/proxy/loopback/live request, Git, package, signing, or release
mutation occurred.

**Next task:** T0138 only — reconcile T0135-T0137 and close checkpoint M4.A before
normalized provider contract tests.

### 2026-08-30 — T0138 checkpoint M4.A GREEN

**Reconciliation:** M4.A agrees across T0135-T0137: 195 unique plan tasks,
exactly 61 contiguous and complete M4 tasks with todo parity, eight ordered
checkpoints, 12 current official sources, TM-34-TM-41, eight G4 boundaries, 15
ownership rows, ten fail-closed requirement owners, and 12/12 new plus 19/19
named inherited seam checks. The audited local links are complete. T0139 is the
only next task.

**Authority decision:** Every unsupported normalized event, destination,
transport, credential, local-compatible behavior, SDK default, OpenRouter/NVIDIA
distinction, provider/model selection, model-requested effect, and unproved
live/package/reproduction claim has a named owner, safe denial, and planned
proof. Uncertainty never changes provider/model/endpoint/credential, attempts an
alternate route, retries/falls back, executes a tool/definition, mutates a file,
or makes a release claim.

**Verification:** Independent `npm run verify` passes 237 unit, 188 integration,
70 component, and 262 active security checks plus three designed skips.
Diagnostics exits zero. Exact Electron 43.3.0 app-shell passes 1/1 with one
worker/zero retries in 17.7 seconds test time / 18.8 seconds total. The final
task/dependency/todo/link audit reports 195 unique headings, M4 61/61 contiguous
complete blocks, exact todo parity, zero missing task IDs, zero broken audited
links, and one next task T0139.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0138-m4-a-checkpoint-green.png` is a fresh
2250x1406 real-Electron capture, 208,005 bytes, SHA-256
`18C6723143FA5A465C41055686114DD925672614379D629310CC42539FF924BD`,
visually clean/unclipped and byte-identical to the latest preview. Final
Electron/Zenith process, app-owned socket-owner, fresh M4-seam root, and marker
counts are zero. The same eight disclosed older/failed roots remain unchanged.
The lock remains 349,335 bytes at SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** Documentation/evidence and preview files only changed. The cleaned
T0137 isolated fake-encryption canary is not production/app-owned or real
credential mutation. No production/test behavior, dependency, lock, SDK,
adapter, transport, DNS/proxy/loopback/listener, IPC/UI route, external/live
request, Git, package, signing, or release mutation occurred.

**Next task:** T0139 only — write RED normalized provider contract tests without
adding implementation or authority.

### 2026-08-30 — T0139 normalized provider contract RED

**Contract frozen:** One inert shared fixture and two tests-only files specify
schema version one; six exact provider IDs including `nvidia-nim`; four offline,
loopback-HTTP, loopback-HTTPS, and remote-HTTPS endpoint classes; fixed
provider/credential-policy pairings; canonical UUID-v4/v7 request IDs;
`manual-or-optional-list` local catalog behavior; `maxToolArgumentBytes`; and
structural tool-schema byte-size/depth proof. Inert tool fragments are
display-only and final structured arguments are authoritative. Ordered
normalized transcripts cover monotonic cumulative usage, before-send and
in-flight cancellation, offline null provider request IDs, one exact terminal,
and 13 failure codes with cancellation represented by its distinct terminal.
Descriptor/request/transcript identities are deterministic, and the
renderer-safe diagnostic view is structural and body/path/secret-free.

**Hostile matrix:** Unknown or authority-bearing keys, case/Unicode/confusable
provider identities, traversal/URL/control/oversize model IDs, malformed or
unsupported UUID and digest facts, provider/endpoint/credential mismatches,
oversize data, open or automatic tools, oversize/over-depth or structurally
unsafe schemas, invalid order/sequence/tool state, non-monotonic usage,
errors/retry metadata, cancellation lies, accessors/prototypes/symbols/proxies,
SDK/runtime handles, secrets, origins/bases/headers/fetch/clients/environments,
and absolute paths all fail closed.

**Intentional result:** Static dependency/format/lint/type gates pass while the
normalized-provider module is absent. Focused unit is 22/22 RED only because
`normalized-provider.ts` is absent. Focused security is 63 expected
missing-module/file failures plus one phase-local
main/IPC/preload/renderer/package non-reachability check GREEN. Full
`npm run verify` reached unit, but one unrelated diagnostics unit timed out once,
so no exclusive 22-case stop is claimed. With the new RED files excluded,
inherited unit/integration/component/security were independently GREEN before
and after at 237/188/70/262 active plus three designed skips.

**Runtime proof:** Diagnostics exits zero. Exact Electron 43.3.0 app-shell passes
1/1 with one worker/zero retries in 17.9 seconds test time / 19.0 seconds total.
`tasks/evidence/artifacts/phase-t0139-m4-normalized-provider-contract-red.png` is
a fresh 2250x1406 capture, 208,005 bytes, SHA-256
`18C6723143FA5A465C41055686114DD925672614379D629310CC42539FF924BD`,
visually clean/unclipped and byte-identical to the latest preview. Process,
app-owned socket-owner, fresh-root, and marker counts are zero; the same eight
disclosed old/failed roots remain. The lock is 349,335 bytes at SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** The future contract module remains absent. No production,
dependency, lock, SDK/adapter/conformance server, network/DNS/proxy/loopback,
credential, IPC/UI, provider/live request, tool/file/definition execution, Git,
package, signing, or release behavior changed.

**Next task:** T0140 only — implement the import-free process-neutral contract
until T0139 turns GREEN, without adding adapter or runtime authority.

### 2026-08-31 — T0140 normalized provider contract GREEN

**Implementation:** One import-free process-neutral shared module now implements
the complete schema-v1 contract frozen by T0139. It exposes deeply frozen
null-prototype descriptors, requests, transcripts, diagnostics, constants,
compilers, and digest verifiers for six provider IDs, four endpoint classes,
canonical UUID-v4/v7 identities, combined UTF-8 input and finite event/output/
tool-argument/deadline budgets, structural schema byte/depth limits, strict
inert tools, monotonic cumulative usage, truthful before-send/in-flight
cancellation, nullable provider request IDs, 13 failure codes distinct from
cancellation, and body-free diagnostics. It adds no adapter or runtime
authority. The source non-reachability assertion remains explicitly phase-local
until an approved integration task intentionally changes that seam.

**Verification:** Focused contract verification passes 22/22 unit and 64/64
security tests. Full `npm run verify` exits zero with 259 unit, 188 integration,
70 component, and 326 active security tests GREEN plus three designed skips.
`npm run diagnostics` exits zero. Exact Electron 43.3.0 app-shell passes 1/1
with one worker/zero retries in 18.0 seconds test time / 19.1 seconds total and
zero observed external HTTP(S) requests.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0140-m4-normalized-provider-contract-green.png`
is a fresh 2250x1408 exact-Electron capture, 201,564 bytes, SHA-256
`D66B6C63135002CC09C2F7B36F76AB3B93633CBDD0B15376B84710A3506E4C97`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, marker, and
temporary holding-file counts are zero. The same eight disclosed old roots
remain. The lock is unchanged at 349,335 bytes and SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** No dependency, SDK, adapter, conformance server, DNS/proxy/
loopback/remote transport, credential, IPC/preload/renderer route, provider/live
request, automatic retry/fallback, file/tool/definition execution, Git mutation,
package, signing, publish, or release behavior was added.

**Next task:** T0141 only — write the adapter-agnostic provider conformance
runner and deterministic scripted/loopback fixture matrix in tests-only RED
state. Production network/provider authority remains forbidden.

### 2026-08-31 — T0141 independent provider conformance boundary RED

**Boundary:** Three tests-only files freeze the independent conformance surface
without adding either helper or any production provider path. Seventeen scripted
adapter scenarios cover model/capability discovery, text, tool proposals,
refusals, cumulative usage, before-send and in-flight cancellation,
authentication, permission, rate-limit/retry-after, context-limit,
provider-error, timeout, overflow, disconnect-before-start, mid-stream
disconnect, and malformed streams. Seven data-only loopback scripts fix one
bounded POST to one fixed path on `127.0.0.1:0` with deterministic chunks,
request-byte/digest facts, redaction, explicit close, and zero retained sockets.

**Fail-closed requirements:** Every adapter report is deterministic,
deep-frozen, and data-only; descriptor read count is one and stream count is at
most one. Late and post-cancellation events, retry, provider/model drift,
provider switching, external destinations, tool execution, secret/raw-body
logging, authority-bearing runner fields, hostile object/runtime shapes,
loopback-origin bypasses, public/fixed binds, redirects, proxies, multiple
requests, oversize budgets, executable chunks, filesystem/process/credential
access, HTTPS, and environment proxy discovery deny.

**Verification:** Focused integration is 25/25 intentionally RED only because
`tests/helpers/provider-conformance-kit.ts` and
`tests/helpers/provider-loopback-server.ts` are absent. Focused security has 38
expected absent-helper/source failures and one phase-local production
non-reachability assertion GREEN. Final `npm run verify` passes preflight,
format, lint, both TypeScript builds, and all 259 unit tests, then reaches the
intended integration state of 188 inherited GREEN plus 25 new RED. Independent
component passes 70/70; independent security passes 326 active plus three
designed skips after one parallel inherited ESLint timeout passed on the
required serial rerun. Diagnostics exits zero. Exact Electron 43.3.0 app-shell
passes 1/1 in 18.2 seconds test time / 19.3 seconds total with zero observed
external HTTP(S) requests.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0141-m4-provider-conformance-red.png` is a fresh
2250x1408 exact-Electron capture, 201,649 bytes, SHA-256
`8F480593FB17074DB659A3656E4B3E71EB43CF0D3D425D47F27571A06E8CE0F1`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, marker, and
conformance-helper counts are zero. The same eight disclosed old roots remain.
The lock is unchanged at 349,335 bytes and SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** No dependency, SDK, production adapter/server, DNS/proxy/remote
transport, credential, IPC/preload/renderer route, live request, automatic
retry/fallback, file/tool/definition execution, Git mutation, package, signing,
publish, or release behavior was added.

**Next task:** T0142 only — implement the two test-only helpers until the frozen
T0141 matrix turns GREEN without production provider or network authority.

### 2026-08-31 — T0142 independent provider conformance kit GREEN

**Implementation:** Two helpers under `tests/helpers/` turn the complete T0141
matrix GREEN while remaining unreachable from production. The independent
runner compiles or verifies the normalized descriptor/request/transcript,
binds provider/model identity and exact observations, rejects authority-bearing
input, isolates every case, and returns deterministic deeply frozen
null-prototype reports. Its scripted adapter supports all 17 cases including
zero-send cancellation. The one-use loopback helper binds only canonical
`127.0.0.1:0`, accepts one bounded fixed-path POST, stops accepting after that
request, records only request bytes and SHA-256 facts, scripts bounded
HTTP/NDJSON/error/disconnect behavior, rejects public/fixed binds and
origin/proxy/redirect/secret bypasses, and closes its listener and sockets.

**RED to GREEN:** T0141 began with 25 integration failures at the absent
helpers and 38 corresponding security failures plus one production
non-reachability GREEN. The first implementation run passed 63/64; one
timeout/aborted-response race was classified as `network`. Honoring the timeout
flag at every terminal transport callback corrected it without changing the
contract or production source. Final focused verification passes 25 integration
and 39 security tests, 64/64 total.

**Verification:** Full `npm run verify` exits zero with 259 unit, 213
integration, 70 component, and 365 active security tests GREEN plus three
designed skips. Preflight, format, lint, both TypeScript builds, and diagnostics
are GREEN. Diagnostics reports exact Electron 43.3.0. Exact Electron app-shell
passes 1/1 in 17.8 seconds test time / 18.9 seconds total with zero observed
external HTTP(S) requests.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0142-m4-provider-conformance-green.png` is a
fresh 2250x1408 exact-Electron capture, 201,447 bytes, SHA-256
`65C8F8181F9DB4D837EDFBAA28A6C6441FA2A0F6DAB0430E74EF405838001E25`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero. The same eight disclosed old roots remain. The lock is
unchanged at 349,335 bytes and SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** No dependency, SDK, production adapter/server, DNS/proxy/remote
transport, credential, IPC/preload/renderer route, live request, automatic
retry/fallback, file/tool/definition execution, Git mutation, package, signing,
publish, or release behavior was added.

**Next task:** T0143 only — migrate the existing deterministic offline fake
adapter through the normalized contract while preserving byte-equivalent G2
behavior and the static zero-network boundary.

### 2026-08-31 — T0143 normalized offline adapter and legacy G2 projection GREEN

**Implementation:** `src/main/offline-normalized-provider.ts` now owns one
fixed offline descriptor, digest-bound compilation from the bounded legacy
request, a normalized six-event tool transcript, truthful cancellation/overflow
failure terminals, and the exact `describe`/`stream` adapter. The existing
`src/main/offline-fake-provider.ts` is a compatibility projection over that
core. It removes only normalized tool-start metadata, renumbers retained events,
maps normalized usage back to historical fields, rechecks the exact legacy
serialized budget, and compares each live projected event to a preflight
projection before yielding it. The existing G2 five-event stream remains
byte-for-byte unchanged, and normal startup continues to use only the legacy
compatibility seam.

**RED to GREEN:** Before implementation, static gates passed and the focused
matrix recorded nine expected absent-module failures plus two GREEN
compatibility/non-reachability assertions. Final focused verification passes
16/16 across normalized/compatibility integration, normalized security,
inherited legacy integration, inherited offline network denial, and the T0142
conformance runner. Observations remain exactly one descriptor read/stream and
zero retry, provider switch, external destination, accepted late event, tool
execution, secret log, or raw-body log.

**Verification:** The first full `npm run verify` hit one unrelated inherited
timing failure in `fixed-test-process-runner.test.ts` because its
launch-observation loop saw zero launches. The exact file reran 5/5 GREEN and
the required complete rerun passed 259 unit, 220 integration, 70 component, and
369 active security tests plus three designed skips. Exact Electron G2 passes
5/5 with one worker/zero retries in 38.8 seconds; its app-shell case passes in
17.6 seconds. Diagnostics exits zero with exact Electron 43.3.0.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0143-m4-offline-normalized-green.png` is a
fresh 2250x1408 exact-Electron capture, 201,115 bytes, SHA-256
`FF65464DF362A34F63D3402C9E1A66DF538D3B54CDED662EE5190E086D027AFB`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero. The same eight disclosed old roots remain. The lock is
unchanged at 349,335 bytes and SHA-256
`11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927`.

**Exclusion:** No dependency, remote provider, SDK, production network
server/client, DNS/proxy/redirect, real credential, IPC/preload/renderer route,
live call, automatic retry/fallback, file/tool/definition execution, Git
mutation, package, signing, publish, or release behavior was added.

**Next task:** T0144 only — close checkpoint M4.B by reconciling the normalized
contract, independent conformance kit, offline compatibility matrix, inherited
G2/G3 behavior, no-network boundary, preview, and residue proof.

### 2026-08-31 — T0144 checkpoint M4.B GREEN

**Reconciliation:** The exact eight-file normalized contract, independent
conformance, normalized offline, legacy compatibility, and trapped-network
matrix passed 166/166 twice without a source change. The T0139-T0144 plan slice
has one dependency-valid task header per task and now one checked checklist item
per completed task. No production implementation was added.

**Verification:** Final `npm run verify` passes 259 unit, 220 integration, 70
component, and 369 active security tests plus three designed skips. Inherited
exact-Electron G2 passes 5/5 in 38.8 seconds and G3 passes 11/11 in 57.9 seconds
with one worker/zero retries. Diagnostics exits zero with exact Electron 43.3.0.
Gate G3 `package.json` and the lock remain byte-identical; provider SDK,
production helper, public generic-provider route, foundation network, and
credential-execution authority counts are zero.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0144-m4-b-checkpoint-green.png` is a fresh
2250x1408 exact-Electron capture, 202,080 bytes, SHA-256
`F6BBE8D1D23FA77B76A1317A958745FF7E781756B5E62CA24C538E1CC621C315`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero. The same eight disclosed old roots remain.

**Remote checkpoint and exclusion:** At the user's request, the state through
T0143 plus T0144's resumable pointer was committed and pushed to `origin/main`
as `1cdc4ee`; this T0144 evidence and documentation followed locally. No SDK,
adapter/server/resolver/transport, credential, IPC/preload/renderer route, live
call, retry/fallback, file/tool/definition execution, package, signing, publish,
or release behavior was added.

**Next task:** T0145 only — write intentionally RED process-neutral destination
and endpoint-classification tests before any resolver or request code exists.

### 2026-08-31 — T0145 provider destination contract RED

**Contract:** One shared hostile fixture and two tests-only files freeze exact
offline, fixed-remote HTTPS, and credential-free local-compatible HTTP(S)
destination records. Canonical output binds provider, endpoint/credential
policy, origin/base/path, host/port/kind/literal, and resolution policy. The
matrix denies control/userinfo/query/fragment/encoding/canonicalization/path/
default-port drift; wildcard, alternate, private, link-local, multicast,
metadata, zone, public, and IPv4-mapped ambiguity; provider/base/credential
mixing; runtime objects; and injected DNS/socket/secret authority.

**RED and inherited verification:** Focused unit is 80/80 intentionally RED at
the absent `src/shared/contracts/provider-destination.ts`. Security records 19
expected absent-module/source failures and two current non-reachability checks
GREEN. Static gates pass. `npm run verify` reaches the intended stop only after
259 inherited unit tests pass. The authoritative serial inherited matrix passes
259 unit, 220 integration, 70 component, and 369 active security tests plus
three skips. One known fixed-process launch-observation race passed its exact
5/5 rerun and the unchanged complete integration rerun passed 220/220. An
earlier concurrent four-project attempt is rejected because host overload caused
unrelated five-second timeouts. Diagnostics exits zero with exact Electron
43.3.0 and safeStorage available; exact app-shell passes 1/1 in 15.9 seconds
test time / 17.1 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0145-m4-provider-destination-red.png` is a
fresh 1800x1125 exact-Electron capture, 161,576 bytes, SHA-256
`3DD8FAF05ECC5BB04ACC35D5F1C8142B75D0C3A58EA75B088C6617931FD539DA`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero; eight old roots remain. Three historical named screenshots
refreshed by app-shell were restored byte-for-byte from `HEAD`.

**Exclusion:** The destination module remains absent and production reference
count is zero. No resolver, DNS/socket/HTTP transport, SDK, adapter, credential,
IPC/preload/renderer route, live request, retry/fallback, dependency, lock, Git,
package, signing, publish, or release behavior was added.

**Next task:** T0146 only — implement the import-free process-neutral
destination compiler/verifier so all 99 intended RED cases turn GREEN without
adding DNS, socket, credential, IPC, renderer, or provider-request authority.

### 2026-09-01 — T0146 provider destination compiler GREEN

**Implementation:** `src/shared/contracts/provider-destination.ts` is one
12,986-byte import-free compiler/verifier. It accepts only exact own-data
records, fixes the four remote provider/base identities, compiles the offline
null destination, and validates credential-free local canonical HTTP(S)
candidates. Prototypes, symbols, accessors, proxies, runtime handles, unknown
fields, unsafe/ambiguous URL/IP forms, and provider/base/credential drift deny
without invoking getters. Output is deterministic deeply frozen null-prototype
data. Verification reconstructs and recompiles instead of trusting a supplied
compiled record.

**Verification:** Focused unit passes 80/80 and security passes 21/21, turning
all 99 intended RED cases GREEN while retaining two phase-local non-reachability
checks. Final `npm run verify` passes dependency/static gates plus 339 unit, 220
integration, 70 component, and 390 active security tests with three skips.
Diagnostics exits zero with exact Electron 43.3.0 and safeStorage available;
exact app-shell passes 1/1 in 15.9 seconds test time / 17.0 seconds total. Static
import, runtime-network, secret-execution, and public production-reference
counts are zero.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0146-m4-provider-destination-green.png` is a
fresh 1800x1125 exact-Electron capture, 161,071 bytes, SHA-256
`439BAB84DEB3A37628DA8D15C704B1911AB52284CC9C44D9F75056B5722896FC`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero; eight old roots remain. Historical named images refreshed by
the app-shell proof were restored from `HEAD`.

**Exclusion:** No DNS resolver/IP result classifier, connection plan,
rebinding/peer check, socket/HTTP transport, SDK, adapter, credential,
IPC/preload/renderer route, live request, retry/fallback, dependency, lock, Git,
package, signing, publish, or release behavior was added.

**Next task:** T0147 only — write intentionally RED DNS/IP/proxy/mixed-answer/
rebinding/peer-drift policy tests before resolver implementation.

### 2026-09-01 — T0147 provider connection policy RED

**Contract:** One 6,569-byte fixture plus integration and security suites freeze
the main-owned resolution/connection policy before implementation. Resolution
is injected, all-address, verbatim, and limited to 16 results. Every canonical
IPv4/IPv6 answer is classified; remote providers require an entirely global
set, while local-compatible DNS names require an entirely loopback set. Stable
sorting/pinning, complete-set preconnect re-resolution, rebinding/drift denial,
exact connected peer address/family/port proof, explicit TLS server-name facts,
and disabled proxy/redirect/retry policy are closed data requirements.

**Verification:** Focused integration is 46/46 intentionally RED at the absent
`src/main/provider-connection-policy.ts`; focused security records 32 expected
absent-module/source failures plus two current production-nonreachability and
no-real-network-import checks GREEN. Dependency/static gates pass. The serial
inherited matrix passes 339 unit, 220 integration, 70 component, and 390 active
security tests with three skips. One inherited diagnostics-unit `safeStorage`
probe fluctuation passed the exact 2/2 and unchanged full 339/339 reruns. Final
`npm run verify` reaches only the intended 46-case integration seam after 339
unit and 220 inherited integration cases pass. Diagnostics exits zero with
exact Electron 43.3.0; exact app-shell passes 1/1 in 15.6 seconds test time /
16.7 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0147-m4-provider-connection-policy-red.png` is
a fresh 1800x1125 exact-Electron capture, 161,525 bytes, SHA-256
`D49459B5CB26831C68EBEEE24753F07DE64B7BC166AFB03800D8B5D96E6C9157`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero; the same eight old roots remain. Three historical named phase
images refreshed by app-shell were restored byte-for-byte from `HEAD`.

**Exclusion:** The production policy module remains absent. No real DNS lookup,
global resolver mutation, socket/HTTP transport, proxy, redirect, retry,
credential, SDK/adapter, IPC/preload/renderer route, live request, dependency,
lock, Git, package, signing, publish, or release behavior was added.

**Next task:** T0148 only — implement the injected main-owned resolution and
connection-policy module so all 80 T0147 cases turn GREEN, then repeat cleanup,
full source, diagnostics, and exact Electron proof.

### 2026-09-01 — T0148 secure connection policy GREEN

**Implementation:** `src/main/provider-connection-policy.ts` is one 22,784-byte
main-owned policy module. It accepts exact own-data only, calls one injected
all-address/verbatim resolver for DNS names, classifies every canonical IPv4/
IPv6 answer, enforces all-global remote and all-loopback local sets, sorts and
pins deterministically, binds issued plans with SHA-256, re-verifies request/
destination/plan facts, re-resolves the complete set before use, denies any
rebinding/drift, and verifies the exact peer address/family/port. Output is
deeply frozen null-prototype data with truthful TLS server-name facts and fixed
disabled proxy/redirect plus no-retry policy.

**Contract correction:** The T0147 security suite both required
`lookupMode: "all-verbatim"` and rejected the substring `lookup` anywhere in
serialized output. The assertion now rejects an exact injected `lookup`
property, preserving the required `lookupMode` field and every authority
denial. No product behavior or permission widened.

**Verification:** The focused 46 integration plus 34 security cases pass twice
after the correction. Final `npm run verify` passes dependency/static gates and
339 unit, 266 integration, 70 component, and 424 active security tests with
three skips. Diagnostics exits zero with exact Electron 43.3.0 and safeStorage
available; exact app-shell passes 1/1 in 15.6 seconds test time / 16.7 seconds
total. Static real-DNS/HTTP/TLS/Undici/fetch/environment/global-resolver/socket/
secret counts are zero, and production non-reachability remains GREEN.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0148-m4-provider-connection-policy-green.png`
is a fresh 1800x1125 exact-Electron capture, 160,912 bytes, SHA-256
`AAB1F9C5DAF167A13B70C61B8DF6D20B9BD63FAD1EF1ADC3431A219267FC9DE8`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero; the same eight old roots remain. Three historical named phase
images refreshed by app-shell were restored byte-for-byte from `HEAD`.

**Exclusion:** No global/default resolver, socket/HTTP/SSE transport, provider
SDK/adapter, redirect, proxy, retry, credential, IPC/preload/renderer route,
live request, dependency, lock, Git, package, signing, publish, or release
behavior was added. Gate G3 package inputs remain byte-identical.

**Next task:** T0149 only — write intentionally RED bounded HTTP(S) transport
and SSE tests before any production request transport exists.

### 2026-09-01 — T0149 bounded provider transport RED

**Contract:** One data-only fixture, an 8,193-byte one-use `127.0.0.1:0`
server, and integration/security suites freeze the sole HTTP(S) transport.
Exact methods/paths/lower-case headers, JSON/SSE content types, finite request/
header/body/line/event/count/connect/first-byte/idle/overall budgets, split
UTF-8/SSE facts, redirect/compression/proxy/retry denial, TLS/disconnect/
timeout/abort cleanup, and redacted one-attempt failures are specified.

**Verification:** Focused integration is 27/27 intentionally RED at absent
`src/main/provider-transport.ts`; focused security records 50 expected absent-
module/source failures plus two current production-nonreachability and loopback-
helper bind/cleanup checks GREEN. Dependency/static gates pass. Final
`npm run verify` reaches only the intended 27-case seam after 339 unit and 266
inherited integration cases pass. The serial inherited matrix passes 339 unit,
266 integration, 70 component, and 424 active security tests with three skips.
Diagnostics exits zero with exact Electron 43.3.0; exact app-shell passes 1/1
in 20.5 seconds test time / 21.8 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0149-m4-provider-transport-red.png` is a fresh
1800x1125 exact-Electron capture, 161,084 bytes, SHA-256
`ED26EE36FAE8B71DDFBDCAB19C31D7F33254E49C8E8162775E25A89897528501`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero; the same eight old roots remain. Historical named images
refreshed by app-shell were restored byte-for-byte from `HEAD`.

**Exclusion:** The production module remains absent. No global resolver,
production HTTP/HTTPS/TLS/socket/SSE path, credential, SDK/adapter, IPC/preload/
renderer route, external/live request, dependency, lock, Git, package, signing,
publish, or release behavior was added.

**Next task:** T0150 only — implement the bounded main-owned provider transport
so all 77 T0149 cases turn GREEN repeatedly with zero socket/process residue.

### 2026-09-01 — T0150 bounded provider transport GREEN

**Implementation:** `src/main/provider-transport.ts` is the sole main-owned
HTTP(S)/JSON/SSE transport. It strictly validates verified destinations and
digest-bound pinned plans, permits one closed GET/POST attempt, owns Host/SNI/
length/identity encoding, and calls the injected connection authorizer with the
actual socket peer before request bytes. Exact request/response/header/SSE/time
budgets, incremental fatal UTF-8 decoding, deep-frozen null-prototype events,
linked abort, and terminal socket destruction satisfy the frozen T0149 policy.
Redirect, compression, proxy, retry, malformed type/stream, overflow, TLS/
network/disconnect, and timeout paths normalize to bounded data-only failures.

**Harness correction:** Five POST failure fixtures replaced their default
headers with only `accept`, accidentally omitting the contract-required JSON
content type and stopping before the intended runtime assertion. Those fixtures
now include `content-type: application/json`; the GET fixture remains bodyless.
The one-use loopback helper also deterministically destroys a socket whose
close event races server teardown. These changes restore the frozen intent and
do not widen production policy.

**Verification:** Focused 27 integration plus 52 security cases pass twice.
Final `npm run verify` passes dependency/static gates and 339 unit, 293
integration, 70 component, and 476 active security tests with three skips. Two
earlier complete attempts encountered unrelated inherited 5-second timeouts;
each exact test passed immediately in isolation, and the final complete run is
clean without a timeout or contract change. Diagnostics exits zero with exact
Electron 43.3.0. Exact app-shell passes 1/1 in 15.9 seconds test time / 17.2
seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0150-m4-provider-transport-green.png` is a
fresh 1800x1125 exact-Electron capture, 161,524 bytes, SHA-256
`8514F159B3F5526D52035EDF83D1B8E72B09C28AC94D584E705871F3F8E5275C`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero; the same eight old roots remain. Three historical named phase
images refreshed by app-shell were restored byte-for-byte from `HEAD`.

**Exclusion:** The transport remains unreachable from credentials, adapters,
IPC, preload, renderer, and the offline run. No resolver implementation,
provider SDK/adapter, credential use, external/live call, dependency, lock,
Git, package, signing, publish, or release behavior was added. OmniRoute stays
excluded and Gemini CLI stays postponed to G11.

**Next task:** T0151 only — write intentionally RED credential-bound request-
service and audit tests before composing credential storage, connection policy,
transport, adapter, cancellation, or provider audit behavior.

### 2026-09-02 — T0151 credential-bound request service RED

**Contract:** One shared fixture plus unit/integration/security suites freeze a
two-step main-owned provider request boundary. Review verifies the normalized
descriptor/request and destination, binds remote provider+origin credential
identity or credential-free local policy, owner/request/run/correlation facts,
closed wire data, one-attempt policies, and a digest while returning no body,
headers, secret, plan, pin, instructions, input, or tools. Execute consumes the
retained review before awaiting, audits requested before planning, revalidates
before decrypt, applies one fixed provider authentication policy inside the
credential callback, calls one injected transport attempt, and records one
structural terminal event.

**Denial and cancellation:** Missing/revoked/wrong-provider/wrong-origin/local
credentials; destination/model/context/credential or owner identity drift;
forged ports/authority; replay; and concurrent reuse deny without confusing
operations. Before-send abort and after-send local stop remain distinct, the
latter states remote work may continue, and no late event survives. Seeded
secret/body/header/raw-error facts remain absent from review, audit, events, and
errors.

**RED proof:** Focused unit records six expected absent `provider.request` audit
failures and two existing separation/redaction passes. Integration is 26/26
intentionally RED at absent `src/main/provider-request-service.ts`. Security
records 27 expected absent-module/source failures plus one current production-
nonreachability pass: 59 intended RED and three GREEN. Dependency/static gates
pass. Full verify also encountered one unrelated inherited safeStorage probe
fluctuation; its exact test immediately passed 2/2. Serial inherited proof with
the RED files excluded passes 339/293/70/476 active plus three skips.
Diagnostics exits zero with exact Electron 43.3.0 and safeStorage available;
exact app-shell passes 1/1 in 15.8 seconds test time / 17.1 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0151-m4-provider-request-service-red.png` is a
fresh 1800x1125 exact-Electron capture, 154,418 bytes, SHA-256
`180AAF4D3C10BF20FB7CC5CAD98DC5A587FEC56088F3A9DB63B337A90DA35A06`,
visually clean/unclipped and byte-identical to the latest preview. Final
Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero; the same eight old roots remain. Historical named images
refreshed by app-shell were restored byte-for-byte from `HEAD`.

**Exclusion:** The production module and provider audit action remain absent.
No credential decryption/use, connection plan, transport call, adapter, SDK,
IPC/preload/renderer route, external/live request, dependency, lock, Git,
package, signing, publish, or release behavior was added. OmniRoute remains
excluded and Gemini CLI remains postponed to G11.

**Next task:** T0152 only — implement the main-owned request service and
minimal provider audit vocabulary so all 59 intended RED assertions turn GREEN
without adding normal-App reachability or live traffic.

### 2026-09-02 — T0152 credential-bound provider request service GREEN

**Implemented:** `src/main/provider-request-service.ts` now owns the exact
two-step review/stream composition frozen by T0151. It independently verifies
normalized provider/request/destination data; retains one deep-frozen,
body/header/secret-free review bound to provider/model/context/credential and
owner/request/run/correlation identities; consumes that review before awaiting;
and denies clones, replay, concurrency, drift, forged authority, and active
cycles. `src/shared/contracts/audit.ts` adds only the structural `provider`
category and `provider.request` action.

Execution appends requested before plan/decrypt/transport, compiles and
revalidates one connection plan, opens one exact provider/origin credential only
inside its callback, injects provider-fixed authentication, and calls the
bounded transport once. Local-compatible remains credential-free. Redirect,
proxy, retry, and fallback remain disabled/none. Pre-send cancellation is
`cancelled-before-send`; post-start cancellation is
`local-stopped-remote-may-continue`, with late events suppressed. Reviews,
events, audits, and typed errors retain no secret, request body/header,
destination/model canary, or raw failure.

**Corrections:** The first implementation rejected a valid connection plan
because its already-verified destination object was shared. The freezer now
reuses a completed frozen copy while rejecting active recursion. The RED fixture
also expected `req_t0151_fixture` while forbidding `/T0151/iu`; its non-secret
provider request ID was corrected to `req_bounded_fixture`. Neither correction
adds authority.

**Verification:** The complete focused slice passes twice: 8/8 unit, 26/26
integration, and 28/28 security, 62/62 per pass. `npm run verify` exits zero with
29 exact direct dependencies/lifecycle scripts disabled, formatting/lint/both
TypeScript builds GREEN, and 347 unit, 319 integration, 70 component, and 504
active security tests plus three designed skips. Diagnostics exits zero with
Node 24.17.0, npm 11.17.0, exact Electron 43.3.0, safeStorage available, and the
hardened fuse projection. Exact app-shell passes 1/1 in 15.6 seconds test time /
16.7 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0152-m4-provider-request-service-green.png` is a
fresh 1800x1125 exact-Electron capture, 154,874 bytes, SHA-256
`2029B437B9138CF58DFC4F15FB9717F9BC16716A228FEFB3CEBA0D7FD3E9A121`,
visually crisp/unclipped and byte-identical to the latest preview. Historical
named images refreshed by app-shell were restored byte-for-byte from `HEAD`.
Final Zenith/Electron process, app-owned socket-owner, fresh-root, and marker
counts are zero; the same eight old roots remain. Gate G3 package and lock
identities remain unchanged.

**Exclusion:** Production IPC, preload, renderer, provider adapters, and the
offline run cannot reach the service. No external/live request, SDK, dependency,
package, Git, signing, publish, or release action occurred. OmniRoute remains
excluded and Gemini CLI remains postponed to G11.

**Next task:** T0153 only — use proof-owned exact-Electron fixtures and loopback
servers to prove success/denial/failure/cancellation audit pairs, restart and
credential revocation, DNS/IP/redirect/limit enforcement, redaction, and cleanup
twice with one worker/zero retries, without normal-App exposure or external
traffic.

### 2026-09-02 — T0153 exact-Electron secure request proof GREEN

**Compact proof:** One proof-only main fixture and one Playwright case replace a
large set of separately launched scenarios. The test runs two independent
matrices internally, each with fresh state and three cold exact Electron 43.3.0
launches (`seed`, `restart`, `revoke`): six launches total in 2.9 seconds test
time / 3.8 seconds total, one worker, zero retries.

**Coverage:** The fixture composes real safeStorage credential persistence,
SQLite audit persistence, normalized provider/destination contracts, connection
policy, request service, bounded transport, and test-owned loopback servers. It
proves injected no-network remote credential use, fixed auth, local SSE success,
DNS-set drift before HTTP request bytes, redirect/overflow denial, raw
error/body/header/path redaction, pre/post-send cancellation and late-event
suppression, cold restart, and persisted revocation before credential callback
or transport. Each matrix ends with 20 provider events/10 exact
requested-terminal pairs. Canary scans remain empty after every launch.

**Verification:** The compact matrix passes 1/1. A deduplicated inherited G2/G3
union passes 15/15 in 1.2 minutes with app-shell included once. Final
`npm run verify` passes 347 unit, 319 integration, 70 component, and 504 active
security tests plus three skips. Two initial aggregates hit the unchanged
filesystem-heavy snapshot materializer's default five-second ceiling; its exact
file passed 3/3 in 3.04 seconds, a narrow 10-second per-case timeout was added,
and the complete aggregate then passed. Assertions and production behavior are
unchanged. Diagnostics exits zero with exact Electron 43.3.0 and safeStorage
available.

**Proof corrections:** A bounded wait records loopback observer zero only after
socket-close callbacks settle; cancellation assertions use the conservative
state with null duplicate reason; and the static nonreachability scan points to
the actual shared IPC contract. These changes are proof/test-only.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0153-m4-provider-secure-request-green.png` is a
fresh 1800x1125 capture, 154,799 bytes, SHA-256
`836BCE5502A82BAB079E4D8CE75F2371F1A33FE47024406A200459622A3113BD`,
visually crisp/unclipped and byte-identical to the latest preview. Historical
named images refreshed by app-shell were restored byte-for-byte from `HEAD`.
Final process/socket/fresh-root/marker counts are zero; the same eight old roots
remain. Package and lock identities are unchanged.

**Exclusion:** The fixture creates no window or production route. Remote
credential proof uses an injected no-network transport; all real sockets are
test-owned loopback. No production code, adapter, SDK, IPC/preload/renderer
surface, external/live request, dependency, package, Git, signing, publish, or
release action occurred. OmniRoute remains excluded and Gemini CLI remains
postponed to G11.

**Next task:** T0154 only — close checkpoint M4.C through documentation and
evidence reconciliation, reusing the compact matrices and adding no runtime
authority.

### 2026-09-02 — T0154 checkpoint M4.C GREEN

**Reconciliation:** T0145-T0153 form one complete destination-to-request chain:
strict remote/loopback endpoint classes; all-address classification and pinned
peer revalidation; finite one-attempt HTTP(S)/JSON/SSE transport; exact
provider/origin credential callback; requested-before-egress structural audit;
redacted success/denial/failure/cancellation; exact-Electron restart/revocation;
and zero cleanup residue. TM-10, TM-12, TM-19, TM-34, TM-37-TM-39, and TM-41
portions owned by M4.C have no critical/high unknown.

**Compact verification:** One Vitest invocation passes the complete checkpoint
surface: 9/9 files and 322/322 assertions in 1.92 seconds. T0153 remains 1/1
with two internal matrices/six cold launches; the deduplicated inherited G2/G3
union is 15/15; final source remains 347/319/70/504 active plus three skips.
Diagnostics reports exact Electron 43.3.0 and safeStorage available. Fresh
app-shell is 1/1 in 21.4 seconds test time / 22.7 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0154-m4-c-checkpoint-green.png` is a fresh
1800x1125 exact-Electron capture, 154,785 bytes, SHA-256
`E8170092AAB9130688DF8359DE7516601DE2D8645FDBDEDAFCB4CB641C1C366B`,
visually crisp/unclipped and byte-identical to the latest preview. Historical
named images refreshed by app-shell were restored byte-for-byte from `HEAD`.
Processes, app-owned socket owners, fresh roots, and markers are zero; eight old
roots remain. Package and lock identities are unchanged.

**Exclusion:** Checkpoint closure changes evidence/docs only. It adds no
production or test behavior, adapter, SDK, IPC/preload/renderer route,
external/live request, dependency, package, Git, signing, publish, or release
action. OmniRoute remains excluded and Gemini CLI remains postponed to G11.

**Next task:** T0155 only — freeze a compact intentionally RED
OpenAI-compatible wire-normalization contract with scenario tables in as few
test files as practical; no implementation or live traffic.

### 2026-09-02 — T0155 compatible-wire normalization contract RED

**Compact contract:** One shared data fixture now drives exactly three
executable tests—one unit, one integration, one security—rather than expanding
every vector into a separately scheduled case. It freezes the compatible
provider/protocol/finish/budget constants; deterministic Chat and local
Responses request encoding; bounded model/error normalization; and the
incremental stream state machine for text, refusals, tools, usage, completion,
and failure.

**Coverage:** The internal tables cover Unicode content after upstream split
UTF-8/SSE reconstruction, split tool arguments, two ordered inert proposals,
partial then cumulative usage, provider extras, `[DONE]`, Responses events,
redacted HTTP-200 stream errors, malformed JSON, multiple choices, response-ID
drift, duplicate/out-of-order tool IDs, early completion, authority-bearing
extras, overflow, late events, and unknown state-bearing events. The security
scenario denies authority/runtime objects and freezes zero network, process,
credential, host-process, or execution dependencies.

**RED and sanity proof:** The combined focused invocation reports 3/3 intended
failures, each only `ERR_MODULE_NOT_FOUND` for the absent
`src/shared/contracts/compatible-wire.ts`, in 407 ms. Preflight, formatting,
lint, and both TypeScript builds pass. One bundled inherited provider invocation
passes 6 files/219 tests in 1.55 seconds. Diagnostics reports Node 24.17.0, npm
11.17.0, exact Electron 43.3.0, safeStorage available, and hardened fuses.
The first app-shell attempt reached its unchanged 45-second ceiling; the
immediate one-worker/zero-retry rerun passed 1/1 in 17.9 seconds test time / 19.1
seconds total. No timeout or assertion was changed.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0155-m4-compatible-wire-red.png` is a fresh
1800x1125 exact-Electron capture, 154,573 bytes, SHA-256
`533AA75FEAF0C6B765E2742E32058D3D7C5E34405F3A73E354889B70275903F7`,
visually crisp/unclipped and byte-identical to the latest preview. Historical
named images were restored byte-for-byte from `HEAD`. Final app-process and
app-owned TCP owner counts are zero; the same eight old temp roots contain zero
markers. Package and lock identities remain unchanged.

**Exclusion:** This phase adds tests/evidence only. No production normalizer,
adapter, SDK, credential use, DNS/socket/HTTP request, IPC/preload/renderer
route, external/live traffic, file/tool/definition execution, dependency, Git,
package, signing, publish, or release behavior was added. OmniRoute remains
excluded and Gemini CLI remains postponed to G11.

**Next task:** T0156 only — implement the process-neutral compatible-wire
compiler and stream/model/error normalizer until all three compact matrices pass
twice, then run one consolidated inherited/security proof and exact-Electron
preview without widening authority.

### 2026-09-02 — T0156 compatible-wire normalizer GREEN

**Implementation:** One process-neutral shared module now compiles verified
normalized requests into exact compatible method/path/header/body facts and
incrementally converts bounded transport facts into existing normalized
started/text/refusal/tool/usage/completed/failed events. Local, OpenRouter, and
NVIDIA share Chat mapping; local alone currently exposes the Responses subset,
matching the secure request-service path policy. Models and errors are bounded
data-only projections, and all successful outputs are frozen null-prototype
data.

**State and denial:** Request/provider/model identity, transport and Responses
sequence, one choice, stream body ID, ordered unique tools, cumulative usage,
finish reason, `[DONE]`, and terminal state are explicit. Tool arguments are
bounded and parsed only to inert JSON at completion. Unknown authority/state,
malformed JSON, duplicate/order drift, premature completion, overflow, and late
events fail closed. The module contains no endpoint/origin, credential, network,
SDK, Electron, filesystem, process, IPC, renderer, or execution capability.

**Corrections:** The request fixture now expects the normalized-provider
compiler's authoritative expanded/sorted string schema rather than its raw
input. The impossible freeze assertion on the test-owned mutable collector now
checks every emitted event. Ignored model/error metadata receives explicit type
and byte validation. Fifteen deterministic malformed mutations run inside the
existing integration test; executable test count remains three.

**Verification:** Final focused unit/integration/security is 3/3 GREEN in 510
ms. An authoritative one-worker all-project invocation passes 158 active files /
1,243 active tests plus two skipped files / three designed skips in 98.17
seconds: 348 unit, 320 integration, 70 component, 505 security. Before that
stable aggregate, parallel runs independently hit the inherited diagnostics
five-second child-process ceiling and fixed-process launch-observation race;
their exact files immediately passed 2/2 and 5/5. No test ceiling, assertion, or
production behavior changed. Static gates and diagnostics pass. Exact Electron
app-shell passes 1/1 in 23.1 seconds test time / 24.8 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0156-m4-compatible-wire-green.png` is a fresh
1800x1125 capture, 154,613 bytes, SHA-256
`8D141C39F771F1CA7F0F9BA9BEDF7453B4C9440B1F943ADE98681A6DA2BB79E2`,
visually crisp/unclipped and byte-identical to the latest preview. Historical
named images were restored from `HEAD`. Final process/TCP-owner/marker counts
are zero; the same eight old roots and package inputs remain unchanged.

**Exclusion:** No adapter, credential use, destination/connection/transport
call, socket, SDK, IPC/preload/renderer route, external or loopback live
traffic, file/tool/definition execution, dependency, Git, package, signing,
publish, or release behavior was added. OmniRoute remains excluded and Gemini
CLI remains postponed to G11.

**Next task:** T0157 only — freeze compact intentionally RED local-compatible
adapter tests over the secure request service and compatible normalizer using
one shared scenario matrix and as few executable tests as practical.

### 2026-09-02 — T0157 local-compatible adapter contract RED

**Compact contract:** One shared fixture drives exactly two executable tests.
The integration/conformance scenario covers descriptor capabilities, Chat text,
split inert tool JSON, usage, optional models, diagnostics, both cancellation
stages, loopback HTTP/HTTPS bases, manual discovery, and the independent
conformance runner. The hostile scenario covers every base, credential,
discovery, environment, network, retry, and fallback denial.

**Ports and policy:** The future adapter accepts one exact structural
secure-request port. Inference, models, and diagnostics must compile verified
descriptor/request/destination/wire facts, bind a null credential, and pass
through that port. `GET /v1/models` is optional; manual mode performs no
request. No direct client, listener, endpoint scan, health/tag path, environment
default, alternate provider, or execution path exists.

**RED and sanity proof:** Focused integration/security is 2/2 intentionally RED
only at absent `src/main/local-compatible-adapter.ts` in 440 ms. Preflight,
formatting, lint, and both TypeScript builds pass. One consolidated one-worker
inherited slice passes 7 files/124 tests in 2.62 seconds. Diagnostics reports
exact Electron 43.3.0 and hardened fuses; app-shell passes 1/1 in 18.7 seconds
test time / 19.9 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0157-m4-local-compatible-adapter-red.png` is a
fresh 1800x1125 capture, 154,869 bytes, SHA-256
`6F8FAEB9A5FB210C2B2E80AF92C2D9DB94D4C222E3BE22DA10D7C39D36341A00`,
visually crisp/unclipped and byte-identical to the latest preview. Historical
named images were restored from `HEAD`. Final process/TCP-owner/marker counts
are zero; the same eight old roots and package inputs remain unchanged.

**Exclusion:** No production adapter, request-service or compatible-module
change, credential use, listener/socket, SDK, IPC/preload/renderer route,
external or loopback live request, file/tool/definition execution, dependency,
Git, package, signing, publish, or release behavior was added. OmniRoute remains
excluded and Gemini CLI remains postponed to G11.

**Next task:** T0158 only — implement the exact adapter plus minimal
request-service GET/models support required by these two compact tests, without
direct network or app reachability.

### 2026-09-02 — T0158 local-compatible adapter GREEN

**Implementation:** Added one strict main adapter that composes the existing
destination compiler, normalized-provider contract, compatible-wire compiler/
normalizer, and injected secure-request service. The factory requires an
explicit canonical loopback `/v1` base, one model, one supported protocol,
manual/optional-list discovery, and finite exact budgets. It exposes normalized
descriptor, inference, model-list, diagnostic, cancellation, and conformance
facts with credentials absent and tools inert.

**Narrow request-service change:** Added only local `GET /v1/models`. It is
model-path-only, JSON-response-only, content-type-free, and null-body. Existing
POST paths and connection, transport, credential, and audit ownership remain
unchanged. The adapter contains no direct network client, resolver, environment
default, credential read, retry, fallback, provider switch, or execution path.

**Accelerated verification:** The same two T0157 executable tests turn GREEN in
793 ms; their internal matrices retain descriptor, text, split-tool, usage,
models, diagnostics, HTTP/HTTPS, both cancellation stages, independent
conformance, hostile bases/authority, and trapped-network coverage. Preflight,
formatting, lint, and both TypeScript builds pass once. One authoritative
one-worker aggregate passes 160 active files/1,245 tests plus two skipped files/
three designed skips in 88.83 seconds (348 unit, 321 integration, 70 component,
506 security), providing the second adapter pass without redundant per-project
launches. Diagnostics reports exact Electron 43.3.0 and hardened fuses;
app-shell passes 1/1 in 17.7 seconds test time / 18.9 seconds total.

**Preview and residue:**
`tasks/evidence/artifacts/phase-t0158-m4-local-compatible-adapter-green.png` is
a fresh 1800x1125 capture, 154,609 bytes, SHA-256
`57B470F5F807EFA337C7E72C9F4727B82549A659BE65E8558CA4CDD6CC6416DA`,
visually crisp/unclipped and byte-identical to the latest preview. Historical
named images were restored from `HEAD`. Final process/TCP-owner/marker counts
are zero; the same eight old roots and package inputs remain unchanged.

**Exclusion:** The normal app cannot reach the adapter. No live loopback or
external call, credential use, SDK, IPC/preload/renderer route, listener,
automatic tool/file/definition execution, dependency, package, signing,
publish, release, or Git action occurred during implementation. OmniRoute
remains excluded and Gemini CLI remains postponed to G11.

**Next task:** T0159 only — prove controlled loopback conformance and failure
isolation, combining socket/error/cancel/cleanup cases into the fewest useful
scenario tests and one deduplicated regression pass.

## Phase-end documentation checklist

Each verified M4 phase records:

- task/checkpoint and exact files/authority changed;
- focused expected RED and final GREEN commands/counts;
- provider, model, endpoint/destination class, credential policy, effective
  context, retry/fallback/redirect/proxy/cancellation facts;
- secret/context/request/response/error redaction and seeded canary results;
- external versus loopback network claim and whether optional live smoke ran;
- full source, diagnostics, conformance, inherited Electron, exact current
  Electron, package/reproduction results as applicable;
- sockets, processes, listeners, temp roots, markers, lock and artifact identities;
- evidence and fresh preview identities;
- limitations, remote/hosted checks not run, and user-owned Git handoff; and
- the unique next executable task.
