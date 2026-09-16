# Zenith — product requirements

**Status:** current product direction, replacing `SPEC.md` 0.3.0 (the Windows-only workbench)
**Updated:** 2026-09-16
**Platform:** Electron desktop app for macOS, Windows and Linux; developed and tested on macOS

---

## 1. The problem

People who work with AI coding tools end up with several of them at once: a subscription CLI such
as Claude Code, an agent such as Hermes Agent or OpenCode, a local model through Ollama or LM
Studio, and one or two API keys. Each has its own window, its own memory of who you are, its own
idea of what it may do to your files, and its own history. Comparing them means copying prompts
between apps, and trusting one with a project folder means learning yet another permission model.

## 2. What Zenith is

One local desktop app that runs all of them, with a single set of rules about what may touch your
computer, one place for your history, and one description of who you are that every model reads.

Zenith is not a model provider and not a cloud service. It orchestrates the tools and keys that
are already on the computer.

## 3. Who it is for

| User                                      | What they need                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| A developer with several AI subscriptions | One window, one history, and their existing sign-ins reused rather than replaced |
| Someone letting an agent change real code | Visible approvals, diffs before writes, undo that also covers shell commands     |
| Someone who prefers local models          | Ollama and LM Studio treated as first-class, with the same tools and approvals   |
| Someone automating small jobs             | Scheduled prompts and chat bots that can never quietly run a tool                |

## 4. Principles

1. **Local first.** Conversations, keys and settings stay on the computer. No Zenith account, no
   telemetry, no server.
2. **Reuse what is signed in.** Zenith never reads another tool's credentials; it runs that tool
   and lets it use its own sign-in.
3. **Nothing consequential happens silently.** Edits, commands and external tools ask, showing
   exactly what will happen. Rules can pre-approve narrow cases, and never hide an action.
4. **Every change is reversible where it can be.** A snapshot before each reply; undo restores the
   project folder, and says plainly what it cannot restore.
5. **Remote input is data, never authority.** Messages from bots and scheduled runs cannot run
   tools.
6. **Plain language.** The interface explains what a thing does and what it costs, in the user's
   words.

## 5. Scope

### Shipped

- **Connections:** Claude Code, Gemini CLI, Copilot CLI, Hermes Agent and OpenCode (ACP), Ollama,
  LM Studio, and user-defined OpenAI-compatible or Anthropic-compatible providers with their own
  base URL, key and model list.
- **Conversation:** one pane per session, with a project folder, plan mode, compaction, retry,
  undo, session memory and named sessions.
- **Agents:** Zenith's own tool-calling loop (`Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`,
  `TodoWrite`, `Remember`, `Task`), Claude Code agent mode driven through Zenith's approvals, and
  MCP tools from `mcp.json`.
- **Safety:** approval cards with diffs and command previews, permission rules
  (`allow|ask|deny <tool> [pattern]`), real-path checks so symbolic links can't leave the project,
  Git-based snapshots and undo, and per-file checkpoints as a fallback.
- **Code intelligence:** formatters after edits (Biome, Prettier, gofmt, rustfmt, Ruff) and
  language-server errors (TypeScript 7's own server, typescript-language-server, Pyright, gopls,
  rust-analyzer) fed back to the model.
- **Workspace:** a real terminal (pseudo-terminal, so full-screen programs work), tests, Git
  status, diffs, commits and worktrees, agent logs, and a central approvals queue.
- **Files:** project tree, Markdown reading view with an outline, and offline previews of web
  pages and images at three widths.
- **Library:** skills, commands and agents as Markdown, shared with Claude Code, OpenCode and
  Hermes layouts; `SOUL.md` and `USER.md`; session roles.
- **Automation:** cron-scheduled prompts; bots for Telegram, Discord, Slack, WhatsApp, Signal and
  Home Assistant, with pairing codes and chat-only replies.
- **History:** full-text search, questions answered from past sessions, optional local embeddings,
  and token-use insights.
- **Appearance:** seven themes, light and dark.

### Deliberately out of scope

- A hosted service, accounts, sync or telemetry.
- Reading or copying other tools' credentials.
- Unofficial APIs for chat platforms (WhatsApp uses the official Cloud API).
- Agents acting without a person present: remote messages and scheduled runs stay chat-only.
- Bypass switches that let an agent skip approvals wholesale.

### Not yet

- Windows and Linux verification, and signed packages.
- Several panes per session, which the code still supports but the interface hides.
- Editing files inside Zenith; the reader is read-only.
- Wiki-style links, backlinks and note search in the Markdown reader.
- PDF preview.

## 6. What "good" looks like

- A new user with Claude Code installed can send a first message without configuring anything.
- Pointing a conversation at a folder and asking for a change ends with a diff to approve and a
  working undo.
- A permission rule the user writes is obeyed exactly, and never allows a chained shell command.
- Nothing leaves the computer that the user did not send: the interface itself has no network
  access, and file previews cannot make requests.
- A scheduled task or bot message cannot change a file, ever.

## 7. Risks to keep in view

- **Prompt injection** from repository contents or tool output: mitigated by approvals, real-path
  checks and rules, not eliminated.
- **Approved commands run with the user's full authority**, and undo covers only the project
  folder.
- **Other agents (Hermes, OpenCode) enforce their own permissions**; Zenith's rules don't reach
  inside them.
- **History and profile files are not encrypted at rest**, unlike credentials.
- **Native modules and CLI updates** can break on a platform Zenith hasn't been verified on.

The full analysis, including accepted risks, is in
`docs/superpowers/specs/2026-09-15-harness-threat-model.md`.

## 8. How the work is organised

Development proceeds in phases recorded in
`docs/superpowers/specs/2026-09-15-harness-features-roadmap.md`, each ending with `npm run verify`
(formatting, lint, types, unit and integration tests) and a check in the packaged app. Phases A
through M are complete; what remains is listed under "Not yet" above.
