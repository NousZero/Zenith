# ADR 0008: Zenith becomes main; Agamemnon's safety layer is carried over in part

**Status:** Accepted
**Date:** 2026-09-23

## Context

Two codebases shared this repository with no common history:

- **Agamemnon** (the old `main`, now tag `agamemnon-archive`): a Windows-first, gate-driven foundation with an approval broker, audit service, journaled file apply, hardened Git inspector, provider connection policy, and a definition studio. It only talked to an offline fake provider and one local adapter, and it could not start outside Windows (`LOCAL_STATE_INVALID_LAYOUT` on any non-`C:\` path).
- **Zenith** (the `zenith` branch): a working product that runs Claude Code, Codex, Gemini, Copilot, ACP agents, Hermes Agent, OpenCode, and API providers in one workspace on macOS, with guardrail postures, gates, review, sandboxing, and undo.

Porting Zenith's features into Agamemnon's architecture would have taken weeks against a codebase that never reached a real assistant. Merging the two histories would have conflicted on every shared path.

## Decision

`main` now points at Zenith. Agamemnon is kept, unchanged, as the tag `agamemnon-archive`, and the full history behind Zenith's squashed first commit as `archive/multi-provider-harness-history`.

The parts of Agamemnon that close a real gap in Zenith were rebuilt in Zenith's style, each with tests:

| Agamemnon                  | In Zenith                                                                                                                                                                                                         | Commit    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Audit service              | `audit_log` table: approvals with the choice made, commands, file edits, undos, and gate runs; secrets masked before writing; newest 5,000 kept; shown in Settings › Guardrails › Activity record                 | `3b34a97` |
| Journaled file apply       | `writeFileAtomic`: temporary file, flush, rename; follows symbolic links and keeps the file mode. Used for Zenith's own agent writes, undo restores, credentials, custom providers, MCP config, and persona files | `883d25d` |
| Hardened Git inspector     | Every Git call sets `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_REPLACE_OBJECTS=1`, `GCM_INTERACTIVE=Never`, `GIT_TERMINAL_PROMPT=0`, and `GIT_PAGER=cat`                                                                     | `a493482` |
| Provider connection policy | `providerFetch`: refuses redirects (fetch keeps `x-api-key` across a cross-site redirect) and requires https per request unless the address is local                                                              | `7052d9d` |

## Alternatives

- **Keep Agamemnon as main and port Zenith into it.** Rejected: weeks of work, and the result would still need real providers and a non-Windows runtime.
- **`git merge --allow-unrelated-histories`.** Rejected: conflicts on every shared file and a history nobody could reason about.
- **Carry Agamemnon over whole.** Rejected for the parts Zenith already covers or does not need: the definition studio (lifecycle, publish, transfer; Zenith's Soul, Role, Skills, and Agents tabs do this job), the supplied-snapshot build step (it breaks packaging outside Windows), the offline fake provider, and the gate evidence files.

## Consequences

- Zenith is not a transactional multi-file editor. A crash cannot leave one file half-written, but restoring several files together is the per-reply checkpoints' and Git snapshots' job, not a journal's.
- Files written by CLI agents (Claude Code, Codex, Gemini, Copilot) are outside Zenith's control. The audit log records the edits they report and the approvals given, not the bytes they wrote.
- Secret masking in the audit log is pattern-based. A secret in an unusual shape is stored as typed.
- Git keeps the user's global configuration, unlike Agamemnon, because commits need the user's name and email.
- Bot transports (Telegram, Discord, Slack, Signal) do not go through `providerFetch`.

## Revisit

- If Zenith ever applies several files as one user-visible operation, bring back a journal with startup recovery.
- If the audit log is exported or shared, replace the masking patterns with the secrets gate's scanner.
