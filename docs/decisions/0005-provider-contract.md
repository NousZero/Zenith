# ADR 0005: Fake-first normalized, policy-bound provider adapters

**Status:** Accepted; M4 security refresh complete  
**Date:** 2026-08-30  
**Supersedes:** the narrower 2026-08-11 wording in this ADR, not its fake-first decision

## Context

The user requires OpenAI, Anthropic, OpenRouter, NVIDIA NIM, and local OpenAI-compatible endpoints. These APIs overlap but differ in event shapes, tool calls, usage, finish reasons, errors, headers, model discovery, and cancellation semantics. Building every adapter before a working edit loop would create a broad horizontal layer with no end-to-end proof.

## Decision

Define a provider-neutral, main-process-only contract for:

- capability discovery;
- model listing or validated manual IDs;
- streaming normalized text/tool/usage/error/completion events;
- abort signals and accurate local/remote cancellation state;
- connection diagnostics;
- authentication, rate-limit/retry-after, context-limit, and provider errors.

Implementation order:

1. offline deterministic fake provider;
2. complete one-file proposal/approval/test loop;
3. one explicitly selected real adapter;
4. independent OpenAI, Anthropic, OpenRouter, NVIDIA NIM, and local-compatible conformance;
5. provider settings/model UI.

Use the official OpenAI JavaScript SDK for OpenAI and official Anthropic TypeScript SDK for Anthropic. OpenRouter, NVIDIA NIM, and local endpoints may share an OpenAI-compatible HTTP/event parser, but each retains separate identity, base URL/header policy, capability map, and error translation.

### Authority and transport rules

- Provider adapters, DNS, sockets, HTTP, credentials, and raw provider/SDK objects remain in main. The renderer receives only frozen allowlisted provider/model/capability/status views and normalized run events over purpose-specific IPC.
- Remote adapters use fixed HTTPS origins: `https://api.openai.com`, `https://api.anthropic.com`, `https://openrouter.ai`, and `https://integrate.api.nvidia.com`. They do not accept a generic renderer-supplied base URL.
- A local-compatible base is an explicit user choice and is credential-free. Plain HTTP is allowed only when every resolved and connected address is loopback. There is no LAN/private/link-local/cloud-metadata/unix-pipe/custom-scheme mode in M4.
- The destination service canonicalizes the URL, resolves all addresses with operating-system semantics, classifies IPv4/IPv6 and mapped forms, denies mixed/forbidden sets, freezes one request-scoped connection plan, pins the approved address through the connection hook, and checks the actual peer before request bytes or credentials are sent. Host/SNI remain the reviewed hostname for remote TLS.
- Redirects are never followed. Environment/system proxy inheritance is unsupported and disabled. M4 does not expose proxy configuration; a proxy-dependent network fails visibly without a direct fallback attempt through another route.
- App and SDK retries are zero. A timeout, rate limit, overload, network error, partial stream error, or abort terminates that local attempt. Re-run, provider switch, and model switch are new visible user actions with new request identities.
- Connection, first-byte, idle, total, request/response-header, response-byte, SSE-line/event, tool-JSON, output, event-count, and model-list budgets are finite and enforced below every adapter. Timeout notification alone is insufficient: abort destroys the request/socket and terminalizes the normalized stream once.
- The immutable request snapshot binds provider, adapter version, model, capability set, display origin/destination class, canonical path, resolved/pinned address facts, credential reference policy, effective-context identity/size, deadlines/budgets, and audit correlation. Drift denies rather than silently rebuilding after approval.
- Provider credentials remain in the privileged credential boundary, are decrypted only inside one destination-bound callback after plan revalidation, and are injected transiently into the one outbound request. They never enter renderer state, run manifests, diagnostics, provider fixtures, SDK logs, or normalized errors.
- Display provider, model, endpoint/destination class, effective context, credential presence (never value), retry/fallback policy, and cancellation limits before send. Audit a redacted requested event before egress and exactly one terminal event afterward.
- Treat provider text, tool calls, usage, errors, headers, model catalogs, and routing metadata as untrusted bounded data. A tool-shaped event can only become the existing exact selected-file proposal; the existing separate approval broker and one-file journal remain the sole mutation path.

### SDK policy

- Resolve exact official OpenAI and Anthropic SDK versions only after registry/integrity/license/lifecycle review. Installation remains scripts-disabled and must reproduce offline before packaging.
- Construct each client with an explicit app-owned API key/base, finite timeout, custom app transport/fetch, `maxRetries: 0`, and logging off. Do not consume API key, base URL, auth token, custom header, log, or proxy environment defaults. Do not enable browser support, automatic tool runners, or SDK fallback helpers.
- The app-owned transport is the sole network authority. SDK middleware cannot create a second socket path or log request/response bodies. Only bounded status/category/request-ID/retry-after facts may survive error normalization.

### Protocol-specific rules

- OpenAI uses reviewed Responses streaming lifecycle events. Function tools use strict schemas (`additionalProperties: false` and every property required, nullable when optional); the adapter never invokes them automatically.
- Anthropic uses Messages block lifecycle events, assembles partial tool JSON only within fixed budgets, treats usage as provider-defined cumulative data, accepts bounded ping/forward-compatible unknown events without changing state, and terminalizes 200-then-SSE-error responses as failure.
- OpenRouter remains a distinct fixed-origin adapter. It sends one `model`, never a `models` fallback list, sets `allow_fallbacks: false`, disables app retry, and exposes bounded routing/data-policy facts. OpenRouter is the reviewed network destination; Zenith does not claim a fixed upstream provider unless the response proves it.
- NVIDIA hosted NIM uses the fixed `integrate.api.nvidia.com` adapter. Self-hosted NIM is handled only by the credential-free local-compatible adapter, not by reusing the hosted credential identity.
- Local-compatible behavior is limited to the reviewed compatible paths/methods/content types. Capability/model discovery is explicit and bounded; the app never scans ports or guesses endpoints.

The conformance kit uses an offline fake server and recorded protocol fixtures. Live smokes are optional, user-approved, redacted, and never required in CI.

### Live-proof policy

Fixture conformance, an explicit loopback smoke, and an actual external-provider call are separate claims. Default tests, diagnostics, CI, package verification, and fresh reproduction perform no live external call and require no credential. Any optional live command must be absent from default scripts and deny until the user explicitly approves the exact endpoint/destination, provider/model, effective context, network use, and credential reference. A live result proves only that one observed request; it does not weaken fixture, package, or reproduction requirements.

## Alternatives

- **One generic OpenAI client for every provider:** rejected because compatibility gaps, errors, routing, and feature flags would be hidden.
- **Provider-specific orchestration:** rejected because the same user workflow should not change semantics by provider.
- **All providers before edit loop:** rejected in favor of the fake-first vertical proof.
- **Automatic fallback routing:** rejected because it can send context to an unapproved destination.
- **SDK/global fetch as the security boundary:** rejected because destination pinning, proxy/retry/logging control, and byte budgets must be owned below all adapters.
- **Environment-driven credentials/endpoints/proxies:** rejected because runtime environment drift can silently change secret and egress behavior.
- **Credential-bearing custom local endpoint:** rejected for M4 because it combines SSRF/local-listener ambiguity with a secret-bearing generic route.

## Consequences

- Normalization code and fixtures are additional work, but provider switching remains explicit and testable.
- Capability flags disable unsupported behavior rather than guessing.
- OpenRouter's own routing behavior and NVIDIA/local deployment capabilities are surfaced as provider facts, not treated as guarantees of one upstream model.
- OmniRoute can later implement the same interface, but has no MVP UI/behavior.
- Proxy-dependent environments are unsupported until a separately threat-modeled explicit proxy design exists.
- Cancellation truth is deliberately conservative: Zenith can prove local socket/stream termination, not remote reversal, deletion, or provider-side stop.

## Primary sources

- OpenAI Responses streaming: https://developers.openai.com/api/docs/guides/streaming-responses
- OpenAI strict function calling: https://developers.openai.com/api/docs/guides/function-calling
- OpenAI JavaScript SDK configuration: https://github.com/openai/openai-node/blob/main/docs/configuration.md
- Anthropic Messages streaming: https://platform.claude.com/docs/en/build-with-claude/streaming
- Anthropic API errors: https://platform.claude.com/docs/en/api/errors
- Anthropic TypeScript SDK client controls: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts
- OpenRouter provider routing: https://openrouter.ai/docs/guides/routing/provider-selection
- NVIDIA hosted NIM API: https://docs.api.nvidia.com/nim/reference/meta-llama-3_1-8b-infer
- NVIDIA NIM LLM API reference: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html
- Node 24 DNS/HTTP/network APIs: https://nodejs.org/download/release/latest-v24.x/docs/api/dns.html, https://nodejs.org/download/release/latest-v24.x/docs/api/http.html, https://nodejs.org/download/release/latest-v24.x/docs/api/net.html

## Revisit

At G4 after every adapter independently passes the same conformance suite twice, the package/fresh reproduction proves no alternate authority, and any optional user-approved live diagnostic is labeled separately. A real external call is not required to close the local technical Gate G4.
