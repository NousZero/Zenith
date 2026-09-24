# Zenith — product requirements

**Status:** current product direction, replacing `SPEC.md` 0.3.0 (the Windows-only workbench)
**Updated:** 2026-09-24
**Platform:** Electron desktop app for macOS, Windows and Linux; developed and tested on macOS,
with Linux and macOS also gated by CI on every push

---

## 1. The problem

People who work with AI coding tools end up with several of them at once: a subscription CLI such
as Claude Code, an agent such as Hermes Agent or OpenCode, a local model through Ollama or LM
Studio, and one or two API keys. Each has its own window, its own memory of who you are, its own
idea of what it may do to your files, and its own history. Comparing them means copying prompts
between apps, and trusting one with a project folder means learning yet another permission model.

## 2. What Zenith is

Run any coding agent on your project, safely, and keep only the changes you want.

One local desktop app that runs all of them, with a single set of rules about what may touch your
computer, one place for your history, and one description of who you are that every model reads.
The core loop is always the same regardless of which assistant answers: pick a folder, ask, watch,
review, keep or undo.

Zenith is not a model provider and not a cloud service. It orchestrates the tools and keys that
are already on the computer.

## 3. Who it is for

| User                                      | What they need                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A developer with several AI subscriptions | One window, one history, and their existing sign-ins reused rather than replaced                         |
| Someone letting an agent change real code | Visible approvals, diffs before writes, undo that covers whole replies, single files, and shell commands |
| Someone who prefers local models          | Ollama and LM Studio treated as first-class, with the same tools and approvals                           |
| Someone automating small jobs             | Scheduled prompts and chat bots that can never quietly run a tool                                        |
| Someone new to a given assistant          | A first-run checklist that gets a first prompt sent within a minute of opening                           |

## 4. Principles

1. **The core loop comes first.** Pick a folder, ask, watch, review, keep or undo — every other
   feature (goals, scheduling, bots, dictation) is an Extra, off by default, and never adds a step
   to that loop when it's off.
2. **Safety by default.** Nothing consequential happens silently. Edits, commands and external
   tools ask, showing exactly what will happen, in a posture (Locked down, Standard, Open) chosen
   once and named before every send. Rules can pre-approve narrow cases, and never hide an action.
3. **Bring your own assistant.** Zenith never downloads or installs an agent, and never reads
   another tool's credentials; it runs what's already on the computer and lets each tool use its
   own sign-in.
4. **Local-first.** Conversations, keys and settings stay on the computer. No Zenith account, no
   server.
5. **No telemetry.** Zenith does not phone home. The only network calls it makes are the ones a
   connection needs to answer a prompt, made under redirect-refusing, https-only rules; the
   interface itself and file previews have no network access at all.
6. **Every change is reversible where it can be.** A snapshot before each reply; undo restores the
   whole reply, a single file, or the project as of any earlier prompt, and says plainly what it
   cannot restore.
7. **Remote input is data, never authority.** Messages from bots and scheduled runs cannot run
   tools.
8. **Plain language.** The interface explains what a thing does and what it costs, in the user's
   words.

## 5. Scope

### Shipped

- **Connections:** Claude Code, Gemini CLI and Copilot CLI (chat, or ACP agents in a project
  folder), Hermes Agent, OpenCode and fifteen more ACP agents when installed, Ollama, LM Studio,
  and user-defined OpenAI-compatible or Anthropic-compatible providers with their own base URL,
  key and model list. Windows agents installed as npm `.cmd` shims are found and launched
  directly, without a shell.
- **The core loop:** one pane per session, a project folder, plan mode, compaction, retry, undo,
  session memory and named sessions; provider, model, folder and pane menu live in the composer's
  controls row.
- **Agents:** Zenith's own tool-calling loop (`Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`,
  `TodoWrite`, `Remember`, `Task`), Claude Code agent mode driven through Zenith's approvals, and
  MCP tools from `mcp.json`.
- **Composer:** `@` file mentions anywhere in the prompt, working in folders with no Git
  repository; a grouped `/` menu (Zenith, Skills, Commands); a first-run checklist in the empty
  workspace (assistant ready, folder chosen, a suggested first task); a pinned plan strip above
  the composer while an agent works.
- **Safety:** three guardrail postures (Locked down, Standard, Open) that write the whole rule set
  in one click, approval cards with diffs and command previews, permission rules
  (`allow|ask|deny <tool> [pattern]`), real-path checks so symbolic links can't leave the project,
  Git-based snapshots and undo, per-file checkpoints as a fallback, optional operating-system
  sandboxing of agent commands (macOS Seatbelt, Linux bubblewrap), a review bar (Keep, Undo all, undo one file),
  restore-to-prompt (roll the project and conversation back to any earlier message), an audit log
  of approvals/commands/edits/undos/checks with secrets masked, atomic file writes, and provider
  requests that refuse redirects and require https unless local.
- **Diagnosis:** a local, rotating error log and a Report a problem action (app/OS/Electron
  versions plus recent log lines, copied to the clipboard only on request); an uncaught
  main-process error is logged and the app keeps running instead of exiting.
- **Second opinion:** one request asking another connection to review the current patch for
  security problems, with no other context.
- **Checks:** after a reply that changed files — leaked secrets, language-server errors, and how
  far the change spread — with one click to send the findings back to the agent; denying the same
  action twice offers to save it as a rule.
- **Code intelligence:** formatters after edits (Biome, Prettier, gofmt, rustfmt, Ruff) and
  language-server errors (TypeScript 7's own server, typescript-language-server, Pyright, gopls,
  rust-analyzer) fed back to the model.
- **Transparency:** "What the model saw" shows every part of the last request with token counts; a
  quiet ACP agent (waiting on its own provider, for example) shows its latest stderr warning after
  15 seconds instead of a bare "thinking…" (Claude Code and the plain CLIs not yet covered).
- **Workspace:** a real terminal (pseudo-terminal, so full-screen programs work), tests, Git
  status, diffs, commits and worktrees, agent logs, and a central approvals queue.
- **Files:** project tree, Markdown reading view with an outline, and offline previews of web
  pages and images at three widths.
- **Library:** skills, commands and agents as Markdown, shared with Claude Code, OpenCode and
  Hermes layouts; `SOUL.md` and `USER.md`; session roles.
- **Conversation extras:** pasted images, branching into a new session, Markdown and HTML export,
  saving a reply as a skill.
- **Extras (off by default, one switch each in Settings → General):** Goals, Scheduled tasks
  (cron-scheduled prompts), Bots (Telegram, Discord, Slack, WhatsApp via the official Cloud API,
  Signal, Home Assistant — pairing codes, chat-only replies), Dictation (local Whisper), Screenshot
  attachments, and a Project board. An extra already in use before the switch is checked starts
  on, so nothing running disappears from view.
- **History:** full-text search, questions answered from past sessions, optional local embeddings,
  and token-use insights — not gated behind an Extras switch.
- **Settings:** four tabs — General (appearance, Extras), Assistants (providers), Agent behaviour
  (Soul, Role, Agents, Skills, Commands), Safety (posture, permission rules, sandboxing, MCP
  servers, activity record, Report a problem).
- **Appearance:** seven themes, light and dark.
- **Reliability:** `npm run verify` (formatting, lint, types, unit, integration and component
  tests) as the one local and CI contract; a Playwright end-to-end suite against the packaged app
  driven by stand-in CLIs (no real quota); a real-agent smoke suite run by hand before a release,
  against installed agents with real sign-ins and a little real quota; CI on every push to `main`
  and every pull request, on Linux, macOS and Windows, all three blocking.
- Side-by-side assistant comparison: one prompt to two or three assistants, each in its own Git
  worktree from the last commit, shown in columns; keep one result (applied to the project,
  staged, and refused if the project moved on) or discard them all.

### Next

- Windows used day to day, and signed packages for all three platforms.
- Comparisons that survive a restart (today an unfinished one can only be discarded after one).
- Stall notices (the "why has it gone quiet" message) extended to Claude Code and the plain CLIs.

### Deliberately out of scope

- A hosted service, accounts, sync or telemetry.
- Reading or copying other tools' credentials.
- Unofficial APIs for chat platforms (WhatsApp uses the official Cloud API).
- Agents acting without a person present: remote messages and scheduled runs stay chat-only.
- Bypass switches that let an agent skip approvals wholesale.

### Not yet

- Several panes per session, which the code still supports but the interface hides.
- Editing files inside Zenith; the reader is read-only.
- Wiki-style links, backlinks and note search in the Markdown reader.
- PDF preview.
- Sandboxed commands on Windows (macOS Seatbelt and Linux bubblewrap only today).

## 6. What "good" looks like

- A new user with an assistant already installed sees the first-run checklist, sends a first
  message, and gets a working reply without configuring anything.
- Pointing a conversation at a folder and asking for a change ends with a diff to approve and a
  working undo — for the whole reply, or for one file.
- A permission rule the user writes is obeyed exactly, and never allows a chained shell command.
- Nothing leaves the computer that the user did not send: the interface itself has no network
  access, file previews cannot make requests, and provider requests refuse redirects.
- A scheduled task or bot message cannot change a file, ever.
- When something breaks, the local error log has enough to diagnose it without asking the user to
  reproduce it blind.

## 7. Risks to keep in view

- **Prompt injection** from repository contents or tool output: mitigated by approvals, real-path
  checks and rules, not eliminated.
- **Approved commands run with the user's full authority**, and undo covers only the project
  folder.
- **Other agents (Hermes, OpenCode) enforce their own permissions**; Zenith's rules don't reach
  inside them.
- **History and profile files are not encrypted at rest**, unlike credentials.
- **Native modules and CLI updates** can break on a platform Zenith hasn't been verified on —
  Windows is CI-tested but not yet used day to day.
- **Stall notices are ACP-only.** A Claude Code or plain-CLI run that's actually stuck still just
  says "thinking…".

The full analysis, including accepted risks, is in
[`docs/superpowers/specs/2026-09-15-harness-threat-model.md`](docs/superpowers/specs/2026-09-15-harness-threat-model.md).

## 8. How the work is organised

Development proceeds in phases recorded in
[`docs/superpowers/specs/2026-09-15-harness-features-roadmap.md`](docs/superpowers/specs/2026-09-15-harness-features-roadmap.md),
each ending with `npm run verify` and a check in the packaged app. `main` carries Zenith's history
forward from the decision recorded in
[`docs/decisions/0008-zenith-replaces-agamemnon.md`](docs/decisions/0008-zenith-replaces-agamemnon.md),
which also lists the parts of the earlier codebase (audit log, atomic file writes, hardened Git
calls, provider redirect refusal) that were rebuilt into Zenith rather than carried over whole.
What remains open is listed under "Next" and "Not yet" above.

## 9. Success measures

- Time from first launch to an approved, kept change in a real project: under a minute with an
  assistant already installed.
- Every shipped safety feature (approvals, sandboxing, undo, audit log) has no silent bypass —
  verified by the Playwright suite, not just by inspection.
- CI blocks a push on Linux and macOS; Windows results are visible before they also block.
- No user report of Zenith reading a credential it wasn't given directly, or a network call
  leaving the interface process.
