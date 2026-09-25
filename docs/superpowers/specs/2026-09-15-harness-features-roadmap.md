# Zenith Harness Features Roadmap

**Status:** Approved by user 2026-09-15. Phases are built in order; each gets its own design, implementation, and verification before the next starts.

**Sources studied:** [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (MIT, Python) and [anomalyco/opencode](https://github.com/anomalyco/opencode) (MIT, TypeScript). Ideas are re-implemented for Zenith's Electron/React/TypeScript stack; any directly adapted code carries attribution per the MIT license.

**Direction:** Zenith grows from a model-comparison harness into a full harness with its own coding tools, while keeping approvals as the safety boundary.

## Phases

| Phase                           | Scope                                                                                                                                                                                                                     | Sources                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **A. Storage foundation**       | SQLite (`node:sqlite`) replaces per-session JSON files: sessions, panes, messages with stable ids and parent links; one-time import of existing JSON sessions with the originals kept as a backup; debounced persistence. | Hermes `hermes_state.py`                                                                                                     |
| **B. Conversation controls**    | Retry, Undo, Branch per pane; auto session titles; slash commands and Ctrl+P palette; personalities and a `SOUL.md` persona.                                                                                              | Hermes `hermes_cli/commands.py`, `personality.py`, `SOUL.md`; OpenCode `session/revert.ts`, `session/summary.ts`, `command/` |
| **C. ACP connections**          | Agent Client Protocol client: Hermes (`hermes acp`), OpenCode (`opencode acp`), and upgraded Gemini/Copilot with persistent sessions; permission/approval prompts in the UI.                                              | Hermes `acp_adapter/`; OpenCode `cli/cmd/acp.ts`                                                                             |
| **D. Comparison power**         | Synthesize answers (Mixture of Agents); per-pane context gauge; automatic compaction using model context limits.                                                                                                          | Hermes `/moa`, `/context`, `/compress`; OpenCode `session/compaction.ts`, models.dev                                         |
| **E. Memory**                   | Full-text search across all sessions; a separate memory section the user can ask questions to (retrieval over history, optional local embeddings via Ollama); persistent user-profile memory; usage insights.             | Hermes `hermes_state_search.py`, `tools/memory_tool.py`, `/insights`                                                         |
| **F. Built-in coding agent**    | Project folder selection; file read/edit/search and shell tools; approvals; checkpoints and rollback; diff view; live task view (todo list and tool timeline) and a project board; MCP servers.                           | OpenCode `tool/`, `permission/`, `snapshot/`, `session/todo.ts`; Hermes `/rollback`, `/approve`, `kanban`                    |
| **G. Bots and app connections** | Slack, Telegram, Discord, WhatsApp (official Cloud API only); pairing and allowlists.                                                                                                                                     | Hermes `gateway/`                                                                                                            |

## Standing constraints

- **Remote messages never execute tools without desktop approval.** Phase G depends on Phase F's approval system.
- **WhatsApp uses only the official Cloud API.** Unofficial WhatsApp Web libraries violate WhatsApp's terms and risk account bans.
- **Other tools' credentials are never read.** Connections use each tool's own login through its official headless or ACP mode.

## Phase A design

- **Engine:** `node:sqlite` (`DatabaseSync`) in the Electron main process. One database file `zenith.db` in the app's user data directory, WAL journal mode, foreign keys on, schema versioned with `PRAGMA user_version`.
- **Schema:** `sessions` (id, name, memory_text, created_at, updated_at); `panes` (id, session_id → sessions, position, name, provider_id, model_id, included, memory_enabled, prompt_tokens, completion_tokens, last_error); `messages` (id, pane_id → panes, parent_id, position, role, content, created_at). Deleting a session cascades.
- **Message ids:** `ChatMessage` gains a stable `id`. `parent_id` links each message to the previous one in its pane, so Phase B can add branches without another schema change.
- **Compatibility:** the renderer's `sessions` IPC API (`list`, `load`, `save`, `delete`) is unchanged. `save` runs in one transaction and upserts rows, deleting panes and messages no longer present.
- **Write volume:** the renderer debounces session persistence, because streaming updates state on every chunk.
- **Migration:** on first start, existing `sessions/*.json` files are imported in one transaction, then the folder is renamed to `sessions-json-backup` rather than deleted.

## Phase B design (implemented)

- **Retry / Undo / Branch:** pure helpers in `src/shared/conversation.ts`. Retry resends a pane's last user prompt with the history before it; Undo removes the last prompt and its reply; Branch copies a pane's messages up to a chosen reply into a new pane beside it, with fresh message ids. Each is available on hover under a reply, in the pane menu, and as `/retry` and `/undo` for every pane.
- **Stop:** a pane's in-flight request is aborted before Retry, Undo, a new send, or pane removal. Aborted or superseded requests never show as errors. Stop buttons appear in the pane and in the composer while replies stream.
- **Auto titles:** a session still named "New session" takes the first line of its first prompt as its name (heuristic; a model-written title can replace it later).
- **Slash commands and palette:** `/new`, `/add`, `/retry`, `/undo`, `/stop`, `/clear`, `/title <name>`, `/personality <id>`, `/settings`, `/help`. The composer completes command names by prefix; Cmd/Ctrl+P opens a searchable palette of the same commands.
- **Personalities and SOUL.md:** a session-level personality preset (schema v2 adds `sessions.personality_id`) and a global `SOUL.md` in the user data folder, edited in Settings. The system message sent to every pane is SOUL.md, then the personality, then session memory when the pane has memory on.

## Phase C design (implemented)

- **Client:** `src/main/acp/` speaks the Agent Client Protocol (newline-delimited JSON-RPC 2.0 over stdio) without an SDK: `initialize`, `session/new`, `session/set_model`, `session/prompt`, `session/cancel`, `session/update` (`agent_message_chunk`), and `session/request_permission`. Zenith declares no file system or terminal capability, so agents use their own tools.
- **Agents:** Hermes Agent (`hermes acp`) and OpenCode (`opencode acp`) appear under "Agents" when installed. OpenCode runs with `OPENCODE_PERMISSION` set so edits, shell commands, web access, subagents, and paths outside the working folder ask first. Hermes asks before dangerous commands and file edits under its own rules; other commands run without asking.
- **Sessions:** one long-lived process per agent and one agent session per pane. A turn reuses the session while the pane's history (hashed, including the last reply) matches what the agent saw; otherwise, e.g. after retry, undo, branch, or a memory change, a new session receives the full transcript. Models come from `session/new`; listing them opens a session that the next turn reuses. Agent sessions are recorded in the agent's own history (for Hermes, its session list).
- **Approvals:** permission requests appear as a card in the pane with the agent's options. Stopping the reply, or the turn ending, cancels any open approval. Only an option the agent offered can be returned.
- **Working folder:** Zenith's empty `cli-sandbox` folder until Phase F adds project folders.
- **Deferred:** Gemini CLI and Copilot CLI keep their headless adapters. Their ACP modes could not be verified on the development machine (Gemini not signed in; Copilot blocked by plan policy).
- **Verified:** protocol shapes against Hermes Agent 0.21.2 live (initialize, session/new with models, set_model, streamed chunks, stopReason); approvals, stop, session reuse, and crash recovery against a fake agent in tests and through the packaged app.

## Follow-ups after Phase G (done 2026-09-15)

1. **Token cost of a trivial message.** Measured "Hi" on 2026-09-15: Claude Code adds its own fixed instructions to every request, about 540 input tokens on Haiku 4.5 and about 720 on Sonnet 5, even with a six-token system prompt; Zenith adds only SOUL.md, USER.md, personality, and memory text when they are set. Ollama answers "Hi" with 20 prompt tokens. Claude Code's `--bare` would remove the overhead but disables subscription sign-in, and `--effort low` changed nothing. Changes: chat mode runs Claude Code with `CLAUDE_CODE_DISABLE_THINKING=1`, which removed hidden thinking (about 30 input and 50 output tokens on Haiku); the pane tooltip explains the fixed overhead; and agent mode now sizes the context gauge from the last model call (`usage.iterations`) instead of the reply's summed usage, while Insights keeps the summed totals.
2. **Per-pane reply inputs hidden by default.** Each pane footer has a reply button that opens or hides that pane's reply box (Escape on an empty box closes it); a Stop button stays in the footer while a reply streams.

## Next phases (H onward)

Decided 2026-09-15: the harness phases remain Zenith's single roadmap; `PLAN.md` M4-M11 is superseded where it overlaps. The M3 definition studio removed in the harness reset is rebuilt lighter and file-based rather than restored. Order follows what makes Zenith a full replacement for Hermes Agent and OpenCode.

| Phase                                      | Scope                                                                                                                                                                                                                                                                                                                                                                                                      | Sources                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **H. Skills, agents, commands**            | File-based skills (`SKILL.md`, compatible with Claude Code, OpenCode, and Hermes layouts) invoked as `/skill-name`; custom agents (Markdown with front matter: prompt, model, allowed tools); custom slash commands from Markdown files with `$ARGUMENTS`; plan mode (read-only planning, then build); project context files (`AGENTS.md`, `CLAUDE.md`) loaded into agent runs. Editor UI for all of them. | OpenCode `skill/`, `command/`, `agent/`, plan tools; Hermes skills system, context files |
| **I. Zenith's own agent loop**             | A native tool-calling loop for API-key providers, OpenRouter, Ollama, and LM Studio with the same tools, approvals, diffs, checkpoints, and task view as Claude Code agent mode; subagents (task delegation) for every agent.                                                                                                                                                                              | OpenCode `tool/`, `session/`, `task` tool; Hermes `delegate_tool`                        |
| **J. Workspace**                           | File tree, read-only editor with diff view, integrated terminal panel with approvals, Git status/diff/commit with approval, worktrees, and git-based snapshots that also capture changes made by commands.                                                                                                                                                                                                 | OpenCode `snapshot/`, `worktree/`, `git/`; old M5 and M7                                 |
| **K. Automation and memory**               | Scheduled tasks (cron) that run a prompt and deliver the result to a paired bot; an agent-writable memory tool with approval; optional local embeddings for Ask.                                                                                                                                                                                                                                           | Hermes `cronjob_tools`, `memory_tool`                                                    |
| **L. Code intelligence and extensibility** | LSP diagnostics fed to agents, formatters after edits, per-tool allow/ask/deny permission rules, plugins, more bot platforms (Signal, Home Assistant).                                                                                                                                                                                                                                                     | OpenCode `lsp/`, `format/`, `permission/`, `plugin/`; Hermes gateway                     |
| **M. Hardening and release**               | Design polish, threat-model review, Windows and Linux verification, signed packages.                                                                                                                                                                                                                                                                                                                       | old M9-M11                                                                               |

## Phase A design

- **Engine:** `node:sqlite` (`DatabaseSync`) in the Electron main process. One database file `zenith.db` in the app's user data directory, WAL journal mode, foreign keys on, schema versioned with `PRAGMA user_version`.
- **Schema:** `sessions` (id, name, memory_text, created_at, updated_at); `panes` (id, session_id → sessions, position, name, provider_id, model_id, included, memory_enabled, prompt_tokens, completion_tokens, last_error); `messages` (id, pane_id → panes, parent_id, position, role, content, created_at). Deleting a session cascades.
- **Message ids:** `ChatMessage` gains a stable `id`. `parent_id` links each message to the previous one in its pane, so Phase B can add branches without another schema change.
- **Compatibility:** the renderer's `sessions` IPC API (`list`, `load`, `save`, `delete`) is unchanged. `save` runs in one transaction and upserts rows, deleting panes and messages no longer present.
- **Write volume:** the renderer debounces session persistence, because streaming updates state on every chunk.
- **Migration:** on first start, existing `sessions/*.json` files are imported in one transaction, then the folder is renamed to `sessions-json-backup` rather than deleted.

## Phase B design (implemented)

- **Retry / Undo / Branch:** pure helpers in `src/shared/conversation.ts`. Retry resends a pane's last user prompt with the history before it; Undo removes the last prompt and its reply; Branch copies a pane's messages up to a chosen reply into a new pane beside it, with fresh message ids. Each is available on hover under a reply, in the pane menu, and as `/retry` and `/undo` for every pane.
- **Stop:** a pane's in-flight request is aborted before Retry, Undo, a new send, or pane removal. Aborted or superseded requests never show as errors. Stop buttons appear in the pane and in the composer while replies stream.
- **Auto titles:** a session still named "New session" takes the first line of its first prompt as its name (heuristic; a model-written title can replace it later).
- **Slash commands and palette:** `/new`, `/add`, `/retry`, `/undo`, `/stop`, `/clear`, `/title <name>`, `/personality <id>`, `/settings`, `/help`. The composer completes command names by prefix; Cmd/Ctrl+P opens a searchable palette of the same commands.
- **Personalities and SOUL.md:** a session-level personality preset (schema v2 adds `sessions.personality_id`) and a global `SOUL.md` in the user data folder, edited in Settings. The system message sent to every pane is SOUL.md, then the personality, then session memory when the pane has memory on.

## Phase C design (implemented)

- **Client:** `src/main/acp/` speaks the Agent Client Protocol (newline-delimited JSON-RPC 2.0 over stdio) without an SDK: `initialize`, `session/new`, `session/set_model`, `session/prompt`, `session/cancel`, `session/update` (`agent_message_chunk`), and `session/request_permission`. Zenith declares no file system or terminal capability, so agents use their own tools.
- **Agents:** Hermes Agent (`hermes acp`) and OpenCode (`opencode acp`) appear under "Agents" when installed. OpenCode runs with `OPENCODE_PERMISSION` set so edits, shell commands, web access, subagents, and paths outside the working folder ask first. Hermes asks before dangerous commands and file edits under its own rules; other commands run without asking.
- **Sessions:** one long-lived process per agent and one agent session per pane. A turn reuses the session while the pane's history (hashed, including the last reply) matches what the agent saw; otherwise, e.g. after retry, undo, branch, or a memory change, a new session receives the full transcript. Models come from `session/new`; listing them opens a session that the next turn reuses. Agent sessions are recorded in the agent's own history (for Hermes, its session list).
- **Approvals:** permission requests appear as a card in the pane with the agent's options. Stopping the reply, or the turn ending, cancels any open approval. Only an option the agent offered can be returned.
- **Working folder:** Zenith's empty `cli-sandbox` folder until Phase F adds project folders.
- **Deferred:** Gemini CLI and Copilot CLI keep their headless adapters. Their ACP modes could not be verified on the development machine (Gemini not signed in; Copilot blocked by plan policy).
- **Verified:** protocol shapes against Hermes Agent 0.21.2 live (initialize, session/new with models, set_model, streamed chunks, stopReason); approvals, stop, session reuse, and crash recovery against a fake agent in tests and through the packaged app.

## Follow-ups after Phase G

Requested by the user on 2026-09-15, to be worked on once all phases are finished.

1. **Token cost of a trivial message.** A single "Hi" costs about 600-700 tokens. Investigate where they come from per connection (for Claude Code, the fixed prompt it adds even with `--system-prompt`, which measured ~536 prompt tokens; SOUL.md, personality, and memory text; Zenith's token estimate versus reported usage) and reduce what Zenith controls.
2. **Per-pane reply inputs hidden by default.** The reply box under every pane should not always be visible. Add a control (for example in the pane header) that shows or hides a pane's reply input.

## Phase D design (implemented)

- **Synthesize (Mixture of Agents):** the header's Synthesize menu (or `/synthesize`) sends the latest answer from every included pane, labelled by pane and model, to the chosen pane's model with instructions to write one best answer and flag real disagreements. The result streams into a new "Synthesis" pane that is left out of broadcasts. The pane shows a short prompt; the model receives the full synthesis prompt.
- **Context gauge:** each pane footer shows tokens in use (the last turn's prompt plus reply, since every turn resends the conversation) against the model's context window. Claude Code reports the window in `modelUsage.contextWindow` and ACP agents in `usage_update.size`; the reported value is saved per pane (schema v3, `panes.context_window`) and cleared when the provider or model changes. Otherwise a small model-name table supplies it (Claude 200k, Gemini 1M, GPT-4o 128k, GPT-4.1 1M); local servers show no limit.
- **Compaction:** at 80% of the window, the next send first asks the pane's own model to summarize everything but the last four messages (prompt adapted from OpenCode's compaction). The summary becomes a system message at the top of the pane, shown as a collapsible "Summary of earlier messages". "Compact conversation" in the pane menu and `/compact` do the same on demand. If automatic compaction fails, the message is sent anyway.
- **Verified:** with Claude Code (Haiku) in the packaged app: gauge from reported usage, synthesis of two panes, and `/compact` followed by a question answered from the summary.

## Phase E design (implemented)

- **History window:** opened from the sidebar, Cmd/Ctrl+K, `/search`, `/ask`, or `/insights`, with Search, Ask, and Insights tabs.
- **Search:** schema v4 adds an FTS5 index over message content (`unicode61`, diacritics removed), kept in sync by triggers and rebuilt from existing messages during the migration. Every typed word is quoted and prefix-matched, so input can never be FTS syntax. Results show session, pane, role, and a highlighted snippet; choosing one opens its session.
- **Ask (memory you can question):** the question's meaningful words retrieve the eight best-matching messages (bm25), which go to a model chosen from the session's ready panes with instructions to answer only from them and name the sessions used. The excerpts are listed under the answer. Retrieval is keyword-based; local embeddings through Ollama remain a possible upgrade.
- **About you (USER.md):** edited in Settings next to SOUL.md and stored beside it in the user data folder. Every pane's system message is SOUL.md, then "About the user", then the session personality, then memory when enabled.
- **Insights:** every finished reply and compaction records a `usage_events` row (connection, model, tokens, whether estimated). Insights shows replies, sessions, input and output tokens, usage by connection, and tokens per day for 7 days, 30 days, or all time. Usage is recorded from this version on; earlier replies are not counted.
- **Verified:** in the packaged app against the existing test data: search with highlights, Ask with Claude Code (Haiku) answering from retrieved messages, USER.md reaching a pane's model, and Insights after two replies.

## Phase F design (implemented)

- **Approach:** Zenith does not reimplement coding tools. Claude Code already has reliable file and shell tools and, in headless mode, can hand every permission decision to its host: `--input-format stream-json --permission-prompt-tool stdio` sends a `can_use_tool` control request on stdout and waits for a `control_response` on stdin. Zenith is that host, so approvals, diffs, and checkpoints are enforced by Zenith. Hermes Agent and OpenCode (Phase C) run in the same project folder with their own approval flows.
- **Project folders:** a pane's folder button (Claude Code and ACP agents only) opens the system folder picker; the folder is saved per pane (schema v5, `panes.project_path`). The main process accepts only an existing absolute directory.
- **Claude Code agent mode:** with a folder, Claude Code runs in it with `Read, Write, Edit, Bash, Glob, Grep, TodoWrite`, `--permission-mode manual`, reads and todo updates allowed, and the user's own settings and hooks excluded. Claude Code itself lets read-only commands inside the folder run; everything else (edits, writes, other commands, anything outside the folder, MCP tools) asks Zenith. Without a folder Claude Code stays the read-only chat from earlier phases.
- **Approvals and diffs:** Edit and Write approvals show a unified diff computed from the file on disk and the proposed change; commands show the command and a warning that undo cannot reverse them. Options: Allow, Allow all of that tool for the rest of the reply, Deny.
- **Checkpoints and undo:** before an approved Edit or Write, the file's contents (or its absence) are saved once per reply (`checkpoints` table, files up to 5 MB). "Undo file changes" restores every file from that reply, newest change first, and deletes files the reply created. Changes made by shell commands are not covered.
- **Live task view:** tool calls stream into the pane as an action list (running, waiting for approval, done, failed, denied) with the agent's todo list above it. ACP agents feed the same view from `tool_call`, `tool_call_update`, and `plan` updates.
- **Project board:** per project folder, columns To do / In progress / Done (`board_cards`). Agents' todo lists are mirrored onto it by title; users can add, move, and delete cards.
- **MCP servers:** `mcp.json` in the user data folder (Claude-style `mcpServers`), edited and validated in Settings, passed to Claude Code agent mode with `--mcp-config` and to ACP agents in `session/new`. Their tools always ask first.
- **Verified:** protocol against Claude Code 2.1.270 live; in the packaged app with Claude Code (Haiku) in a scratch folder: todo list, approval with diff, edit and new file after approval, undo restoring both files, and the board showing the agent's tasks. Integration tests cover allow, deny, checkpoints, rollback, and board sync with a fake Claude Code.
- **Known limit:** in agent mode Claude Code reports tokens summed over every step of a reply, so the context gauge overstates how full the context is (to be handled with the token follow-up).

## Phase G design (implemented)

- **Transports that need no public server where possible:** Telegram uses long polling (`getUpdates`); Discord uses the Gateway WebSocket with only the `DIRECT_MESSAGES` intent (no privileged intents); Slack uses Socket Mode (`apps.connections.open`, envelopes acknowledged). WhatsApp uses only the official WhatsApp Business Cloud API from Meta; because Meta delivers messages to a webhook, Zenith serves `/webhook` on `127.0.0.1` at a chosen port for a tunnel the user controls, answers the verify-token challenge, and rejects any POST whose `X-Hub-Signature-256` does not match the app secret. Unofficial WhatsApp Web libraries are not used.
- **Pairing and allowlist:** a bot answers only people paired from the desktop. "Pair a person" shows a six-digit code valid for ten minutes; the person sends `/pair CODE` to the bot in a direct message. Five wrong codes cancel the current code. Unpaired people get one "this bot is private" notice per app run and nothing else. Paired people can be removed in Zenith. Bots ignore group and channel messages.
- **No remote tools:** bots reply through chat connections only (Claude Code without a project folder, Gemini CLI, Copilot CLI, local servers, API keys). Agents with tools (Hermes Agent, OpenCode) are refused in the main process and hidden from the picker, so a remote message can never start a tool, satisfying the standing rule without a remote approval path.
- **Conversations:** each chat keeps its last 20 messages (`bot_messages`, schema v6) as context; `/reset` clears it and `/help` explains. Replies in one chat are handled in order and split to each platform's message limit. Usage is recorded for Insights.
- **Secrets:** tokens are stored with the existing OS-encrypted credential store under `bot:<platform>` and never sent to the window, which only learns whether a platform is configured.
- **UI:** Bots window (sidebar, `/bots`) with a card per platform: status, on/off, setup steps, token fields, the connection and model used for replies, pairing, and paired people.
- **Verified:** tests cover pairing, allowlist, the guessing limit, group messages, refused connections, history and reset, Telegram polling and sending against a local HTTP server, the WhatsApp webhook challenge and signature checks against a real local server, and Discord and Slack message parsing. In the packaged app, a fake Telegram token surfaced Telegram's 401 error, the token never reached the window, and pairing codes appeared. No real bot accounts were available, so live platform connections are untested.

## Phase H design (implemented)

- **Library sources:** skills (`**/SKILL.md`), commands (`*.md`, subfolders become `folder:name`), and agents (`*.md` with front matter) are read from Zenith's own `library/` folder, each open project's `.zenith/`, `.claude/`, `.opencode/` (and `.agents/skills`), `~/.claude/`, `~/.config/opencode/`, and `~/.hermes/skills`. The first source wins on a name clash: Zenith, then project, then other tools. Scans skip `node_modules`, hidden folders, files over 256 KB, and stop at 500 items per folder. Only files found by the latest scan can be read, and only Zenith's own items can be edited or deleted; items from other tools can be copied into Zenith.
- **Front matter:** a small YAML subset (scalars, inline lists, block lists) covering Claude Code, OpenCode, and Hermes files; agents keep display names with spaces, while skills and commands need names usable after `/`.
- **Running skills and commands:** library skills and commands join the composer's `/` menu (Zenith's built-in names always win). A command fills `$ARGUMENTS` and `$1`-`$9` (or has the arguments appended); a skill sends its instructions and folder path with the task. Panes show `/name args`; models receive the expanded prompt.
- **Agents:** a pane's menu chooses a library agent (schema v7 `panes.agent_path`). Its body is added to that pane's instructions, and a `tools:` list narrows Claude Code agent mode's tools.
- **Plan mode:** a pane setting (schema v7 `panes.plan_mode`). Every connection gets plan-only instructions, and Claude Code agent mode keeps only Read, Glob, Grep, and TodoWrite. After a plan reply, "Build this plan" turns plan mode off and asks the agent to build it.
- **Project context:** Claude Code agent mode runs with `--setting-sources ""` (verified to skip project memory), so Zenith adds the project's `AGENTS.md` and `CLAUDE.md` (up to 20 KB each) to its instructions. Hermes Agent and OpenCode read their own context files.
- **UI:** Library window (sidebar and `/library`) with Skills, Commands, and Agents tabs, filtering, Markdown preview, create, edit, delete, and copy to Zenith; agent and plan badges in pane footers.
- **Verified:** in the packaged app the Library found 163 skills (112 Hermes, 51 Claude Code) and 184 agents from this machine; a command created in the Library ran from the composer in two Haiku panes; a pane with a library agent in plan mode produced a plan without asking to change anything and followed the agent's prompt; "Build this plan" then asked to edit with the right diff and applied it after approval.

## Phase I design (implemented)

- **Scope:** panes on OpenAI, Anthropic, OpenRouter, Ollama, and LM Studio can now work in a project folder. Their requests then go through Zenith's own agent loop (`src/main/agent/native-agent.ts`); without a folder they stay plain chats. Gemini CLI and Copilot CLI stay chat-only.
- **Models:** `models.ts` streams tool calls from OpenAI-compatible chat completions (function tools, argument deltas reassembled by index) and from the Anthropic Messages API (`tool_use` blocks with `input_json_delta`, `tool_result` blocks sent back in user turns). A model that rejects tools gets a clear message instead of a raw API error.
- **Tools:** `Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`, `TodoWrite`, and `Task`, named like Claude Code's so agent definitions' `tools:` lists apply to every connection. Reading inside the project runs freely; reading outside it, edits, writes, and commands ask with the same approval cards, diffs, and "allow all of this tool for the reply" option as Claude Code agent mode. Approved Edit and Write calls are checkpointed for undo. Commands run in the project with the user's PATH, a 2-minute default timeout (10-minute cap), and output cut at 30,000 characters. Tool mistakes (text not found, invalid regex, missing file) go back to the model as results so it can correct itself.
- **Subagents:** `Task` starts a fresh loop with the same tools except `Task`, so delegation can't recurse; its tool calls appear in the pane's action list with a "↳" prefix and its report returns to the parent as the tool result.
- **Loop:** up to 30 model calls per reply; text from separate calls is separated; usage is summed for Insights while the context gauge uses the last call. Plan mode and agent definitions restrict tools exactly as in Claude Code agent mode, and the project's `AGENTS.md` and `CLAUDE.md` are included.
- **Verified:** integration tests with fake OpenAI-compatible and Anthropic streaming servers cover reading, approved edits with diffs and rollback, denial fed back to the model, an approved shell command, a subagent run, plan-mode tools, and the no-tools error. In the packaged app, a stand-in LM Studio server on port 1234 drove a full run: task list, read, edit approval with the right diff, the edit applied, and undo restoring the file. No tool-capable local model or API key was available for a live model test: the only Ollama model here, `qwen2.5vl:7b`, does not support tools.

## Phase J design (implemented)

- **Workspace panel:** a side panel for any open project folder (header "Workspace" button or "Open workspace" in a pane's folder menu), with Files, Changes, and Terminal tabs. Every path the window sends is resolved against the project's real path, so `..` and symbolic links can't reach outside it.
- **Files:** a lazily expanded tree (`.git` hidden) and a read-only viewer with line numbers; binary files and files over 1 MB are not shown.
- **Changes:** branch and `git status` (porcelain, untracked files included), a diff per file against `HEAD` (whole file for new files), "Commit all" with a confirming second click (stages everything; the repository's own hooks run, as with `git commit`), and worktrees: list, create on a new branch in a sibling folder, and open in a new pane. Background Git calls turn off fsmonitor and external diff programs, and never prompt.
- **Terminal:** runs the user's own commands in the project with streamed output, stop, and recall of the last command. It is not a pseudo-terminal (that would need a native module), so programs waiting for keyboard input don't work.
- **Snapshots:** before every reply from a connection that can change files (Claude Code, Hermes Agent, OpenCode, and Zenith's own agent), except in plan mode, Zenith records the project's files as a tree in a Git database of its own under the user data folder (`add -A` plus `write-tree`, respecting the project's `.gitignore` and skipping `node_modules`, `dist`, `build`, `out`, and `.vite`). Undo restores that tree, deleting files created since, so it covers shell commands and other agents' edits too. Snapshots never touch the project's own repository. Without Git, undo falls back to the per-file checkpoints from Phase F.
- **Header:** when the panel narrows the main area, header buttons collapse to icons (labels stay available to screen readers).
- **Verified:** integration tests with real Git cover status parsing, diffs, commits, worktrees, snapshot restore of edited, created, and deleted files, path confinement including a symlink escape, binary detection, and the terminal. In the packaged app: browsing and viewing files, `git init` and a first commit from the Terminal tab, and a Claude Code reply whose approved shell command created a file that appeared under Changes and was removed by Undo.

## Phase K design (implemented)

- **Scheduled tasks:** a prompt, a five-field cron schedule in local time (or `@hourly`/`@daily`/`@weekly`, with presets in the form), a connection and model, and optional paired bot users to send results to (schema v9 `scheduled_tasks`). A 30-second timer runs due tasks while Zenith is open; a run missed while it was closed happens once at startup, and the next run is counted from then. Every result is saved with the task, shown as a desktop notification, and sent to the chosen bot users. Runs are plain chats with no project folder, and agents with tools are refused, because nobody is present to approve tools. Run failures and failed deliveries are recorded without stopping the schedule. "Run now", pause, edit, and delete are in the Scheduled tasks window (sidebar and `/schedule`).
- **Bot delivery:** pairing and every later message store the person's private chat (`bot_users.chat_id`), so results can be sent to people who paired before; the bot must be running.
- **Memory the agent writes:** Zenith's own agent has a `Remember` tool that proposes one fact for the user's profile (`USER.md`); the approval card shows the diff, and the window reloads the profile after a save. Plan mode leaves it out. For every connection, "Remember…" on a reply opens a small form to shorten the text and add it as a bullet to the profile or to the session's memory.
- **Meaning-based search (optional):** in History → Ask, the user can name an Ollama embedding model (checked before saving). Messages are embedded in batches (at most 256 new ones per question) into `message_embeddings`, the question's closest messages by cosine similarity come first, and keyword matches fill the rest. If Ollama is off or no model is set, Ask uses keyword matching as before.
- **Verified:** tests cover cron parsing (ranges, steps, lists, Sunday as 7, either-day matching, leap days, invalid input), the scheduler (due runs, delivery, failures, catch-up, disabled tasks), the Remember tool with approval and diff, and the semantic index with a toy embedder (search, indexing status, rejecting a model that can't embed, merging). In the packaged app: a scheduled task created in the window ran with Claude Code and showed its result and next run; "Remember…" added a fact to USER.md; and Ollama's refusal to embed with `qwen2.5vl:7b` was reported without saving the setting while Ask fell back to keywords. Bot delivery was tested with fakes only, since no bot accounts are configured.

## Phase L design (implemented)

- **Permission rules:** Settings → Agent permissions holds one rule per line, `allow|ask|deny <tool> [pattern]`, stored in `app_settings`. `*` matches any text in the tool name or pattern; the pattern is matched against the command (Bash), the URL, or the path (relative inside the project). The last matching rule wins, and with no match the agents behave as before. An allow rule never matches a Bash command containing `; & | $ < > ( ) { }`, backticks, or newlines, so "allow Bash npm test*" cannot approve a chained command. Rules apply to Zenith's own agent and to Claude Code agent mode; in Claude Code, a reading tool named by an ask or deny rule is no longer pre-approved, so Zenith sees and decides each use. A denied action tells the model a rule blocked it. "Allow all of this tool for the reply" still overrides an ask rule for that reply. Hermes Agent and OpenCode keep their own permission prompts; their tool names differ, so rules don't apply to them.
- **Formatters:** after an approved Edit or Write, Zenith's own agent runs the project's Biome or Prettier from `node_modules/.bin` for web files, or `gofmt`, `rustfmt`, or `ruff format` from the PATH. When the file changed, the tool result tells the model to read it again. Missing or failing formatters are ignored. Project formatters are skipped on Windows for now: their `.cmd` shims need a shell, which would expose the file path to it.
- **Language server problems:** after the same edits, the file's text goes to the project's language server, and its errors (at most 20) are added to the tool result. Candidates are TypeScript 7's own server (`tsc --lsp --stdio`), then `typescript-language-server`, `pyright-langserver`, `gopls`, and `rust-analyzer`, taken from the project's `node_modules/.bin` or the PATH. Both pushed diagnostics and diagnostic requests (TypeScript 7 answers only those) are supported. A server starts on the first edit of a matching file and runs until Zenith quits; a server that is missing or fails to start is not retried.
- **Extensions:** MCP is the plugin format Claude Code, OpenCode, and Hermes share, so Zenith's own agent now uses the servers in `mcp.json` too. Tools are named `mcp__server__tool` and always ask unless a rule allows them. They are left out in plan mode, and an agent definition may list a tool or a whole server (`mcp__server`). Servers start per project on first use and stop when removed from `mcp.json` or when Zenith quits. JavaScript plugins that run inside Zenith were not added, because they would run with full access to Zenith's own process.
- **Bots:** Signal through signal-cli-rest-api on this computer (polling `/v1/receive`, sending with `/v2/send`), and Home Assistant through its WebSocket API. Home Assistant sends messages as a `zenith_message` event, and Zenith replies with a `zenith_reply` event (`chat_id`, `text`) that automations can turn into a notification or speech. Only the user Home Assistant records in the event's context counts, never a name in the event data. Pairing and chat-only replies work as on the other platforms.
- **Verified:** unit tests cover rule parsing, wildcards, last-match order, and chained commands. Integration tests cover formatting with a stand-in Prettier; language servers with a stand-in server in push and pull modes, including falling back when a server is missing; MCP listing across pages, calls, tool errors, and stopping removed servers; the native agent with rules, problems after edits, and MCP tools; Claude Code agent mode following allow and deny rules; the Signal transport against a stand-in REST API; and Home Assistant event parsing and replies. Live checks outside the app: real TypeScript 7 and TypeScript 5 (through typescript-language-server) each reported "Type 'string' is not assignable to type 'number'" and returned nothing once the file was fixed; `gofmt` reformatted a Go file; `@modelcontextprotocol/server-filesystem` listed 14 tools and ran `list_directory`. In the packaged app, a stand-in LM Studio drove Zenith's own agent in a TypeScript 7 project with the rules `allow Write b.ts`, `deny Bash echo *`, and `allow mcp__fs__list_directory`. The write ran without asking and returned the real TypeScript error, the command was blocked, and the MCP filesystem tool listed the folder. Settings rejected a malformed rule with its line number. No MCP or language server processes were left after the app quit. Signal and Home Assistant were not tested against real accounts.

## Workbench shell (implemented 2026-09-15)

- **Why:** the user preferred the local workbench design from `main` (the M0-M3 shell removed in the harness reset) and asked for one app that combines its design with the harness features.
- **Layout:** a top bar (Zenith mark, "LOCAL WORKBENCH", connection count), a numbered activity rail (01 Workspace, 02 Soul, 03 Role, 04 Agents, 05 Skills, 06 Commands, 07 Plugins, 08 Settings) with sessions, History, Scheduled tasks, and Bots below it, a run inspector on the right from 1280 px wide, and a bottom dock. Colors, square corners, mono labels, serif page titles, and the grid ground follow `main`'s `styles.css`, set as the Tailwind theme tokens so every existing dialog and pane uses them.
- **Where harness features went:** Workspace holds the panes and composer. Soul edits `SOUL.md` and `USER.md`. Role sets the session personality. Agents, Skills, and Commands are the library, browsed inline (the dialog remains only for choosing a pane's agent). Plugins holds `mcp.json` and the permission rules. Settings holds connections, API keys, and links to bots, scheduled tasks, and usage insights. The inspector shows the focused pane's soul, role, agent, skill counts, project, mode, context, task list, and ready connections. The dock has Terminal, Tests (detects `npm test`, `cargo test`, `go test ./...`, or pytest and runs only after a confirming click), Git, Files, Logs (agent actions and errors from each pane's latest reply), and Approvals (every waiting approval, answerable there as well as in its pane), with `main`'s approval queue drawer. A new approval opens the dock on Approvals.
- **Not carried over from `main`:** the definition lifecycle review, provenance, import and export, and the fixed test verifier with digests. Their backend was removed in the harness reset, and the harness covers the same needs more simply (file-based library, approvals, snapshots).
- **Also fixed:** library front matter now reads `key: |` and `key: >` block text, so skills such as gstack show their descriptions instead of "|".

## Workbench refinements (implemented 2026-09-15)

- **Top bar:** the decorative three-dot mark is gone (the operating system draws the real window controls). On the right: connection status, a button that shows or hides the bottom dock, and a bell button that opens the run inspector as a popover, with a badge counting waiting approvals (or a dot while a reply runs). The inspector is no longer a permanent right column. A new approval still opens the dock on its Approvals tab.
- **Rail:** Workspace, New session, the session list, and at the bottom History, Scheduled tasks, Bots, and Settings.
- **Settings:** one page with tabs: Appearance, Providers, Soul, Role, Agents, Skills, Commands, Plugins, Automation.
- **Themes:** Graphite (default), Midnight, Nord, Solarized, Rosé, Parchment (light), and Paper (light), as palettes under `:root[data-theme]`. The choice is stored per device in local storage and applied before the first render.
- **Providers:** the fixed OpenAI, Anthropic, and OpenRouter key boxes are replaced by one form, as in OpenCode and Hermes Agent: start from a preset (OpenAI, Anthropic, OpenRouter, Google Gemini, Groq, DeepSeek, Mistral, xAI, Together AI) or Custom, then set a name, API type (OpenAI-compatible or Anthropic), base URL, API key, and optional model IDs (empty asks the server's `/models`). Providers are saved to `providers.json` without keys, and keys go to the encrypted credential store under `custom:<slug>`. The base URL must be https, except for this computer and private network addresses, and may not contain credentials. Saved providers appear by name in the pane's provider menu and can chat, or run Zenith's own agent in a project folder. Keys saved for the built-in providers before this change keep working and can be removed there. Plain chats no longer send an empty `tools` list, which some servers reject.
- **One pane per session (multiple panes on hold):** each session shows and sends to its first pane only. Add pane, Synthesize, the broadcast switch, per-pane reply, "Branch into new pane", and "Remove pane" are hidden, and "Open in new pane" for a worktree now switches the pane's folder. Extra panes in older sessions are kept in the saved session, not deleted. The multi-pane code remains for later.
- **Verified:** unit tests for base URL rules and slugs, and integration tests for the provider store (keys kept out of the file, empty key keeps the saved one, null removes it) and for chat and model listing through an OpenAI-compatible address with the saved key. In the packaged app: the Providers form rejected `http://api.example.com` with the https message, saved a stand-in server at `http://127.0.0.1:1234/v1`, the connection listed it as ready, and its model list came back; the Paper theme, dock toggle, and inspector popover worked.

## Phase M design polish (implemented 2026-09-16)

- **Scope:** the user limited Phase M to design polish; Windows and Linux verification and signed packages are skipped for now.
- **Top bar:** shows where you are as a breadcrumb (for example `WORKSPACE / NEW SESSION` or `SETTINGS / PROVIDERS`) in place of the fixed "LOCAL WORKBENCH" label.
- **Workspace:** the session header is one 48 px row (label, editable serif name, token count, Memory). A new conversation shows the Z mark, "What are we working on?", and three hints: `/` for skills and commands, ⌘K for history, and choosing a project folder for agents. The pane footer no longer shows the internal pane name.
- **Consistency:**
  - **Corners:** composer, chat bubbles, popovers, dialogs, and empty-state icons use the theme radius instead of fixed 12 px corners.
  - **Dialogs:** titles use the serif page-title face.
  - **Automation tab:** Bots, Scheduled tasks, and Usage insights are described cards instead of three bare buttons.
  - **Bots dialog:** "Save token" sits beside the token field when it has room.
- **Themes:** switching turns off transitions for two frames, so every color changes at once instead of fading through the old palette.

## File reader and preview (implemented 2026-09-16)

- **Why:** the user asked to view files inside Zenith, both as web pages and as a Markdown reader.
- **Local scheme:** `zenith-file://preview/<project>/<path>` is registered as a privileged, secure standard scheme and served by the main process (`preview-protocol.ts`). It serves only folders the window is working in (`ipc.isOpenProject`), resolves every path with the workspace's real-path confinement, and answers with the file's media type, `X-Content-Type-Options: nosniff`, and a policy of its own: `connect-src 'none'`, no frames, no forms, no remote origins at all. So a previewed page can load its own folder's styles, scripts, and images, and can reach nothing else — no network.
- **Files tab views:** Markdown opens in a reading view, web pages and images in a preview, everything else as text with line numbers, switched by Read / Preview / Source. Previews render in an `<iframe sandbox="allow-scripts allow-same-origin">`; the window's own policy now allows frames and images only from `zenith-file:`.
- **Reading view:** headings, tables, task lists, quotes, and code as in chat, plus links to other files in the project, which open in the reader, and images loaded through the local scheme. Addresses with a scheme (`https:`, `mailto:`) stay inert text, as elsewhere in Zenith.
- **Dock:** an expand button makes the bottom panel 72% of the window for reading, and shrinks it back.
- **Verified:** integration tests cover the served media types, the policy header, and refusals for folders that are not open, for `..`, for a symbolic link that leaves the project, and for missing files. In the packaged app: the landing page the agent wrote rendered in the Files tab, `NOTES.md` rendered as a page with a working local image, and its link opened `index.html` in the preview.

## Files as a main page (implemented 2026-09-16)

- **Why:** the user wanted previews in the main area rather than the short bottom dock, reached from the rail.
- **Rail:** Files sits under Workspace and above New session; the dock keeps Terminal, Tests, Git, Logs, and Approvals.
- **Files page (`FilesView.tsx`):** a filterable project tree beside a full-height reader, with the project folder named in the page header (a picker when a session has more than one) and in the breadcrumb.
- **Reader:** Markdown reads as a page with an outline of its headings on wide windows (clicking a heading scrolls to it); web pages and images preview in the sandboxed local frame with Full, Tablet (820 px), and Phone (390 px) widths for checking a layout; everything else opens as text. A reload button re-reads the file, and Read / Preview / Source switch the view.
- **Verified in the packaged app:** `NOTES.md` rendered with its outline, local image, table, and working link; `index.html` rendered at full and phone widths; the breadcrumb tracks the page.

## Terminal input, Tests results, exact models, and Claude Code commands (implemented 2026-09-16)

- **Terminal keeps taking input:** the workspace terminal now spawns commands with an open standard input, and lines typed while a command runs are sent to it (`workspace:input`, with `workspace:endInput` to close it). The box stays enabled with the placeholder "Type a line for the running command…", Send appears beside Stop, and Up and Down walk through earlier commands. It is still not a pseudo-terminal, so full-screen programs (editors, pagers) don't work, but ones that read plain lines (`node`, `python`, `sqlite3`) do.
- **Tests shows results only:** the detected command is a label with Run (confirming second click) and Stop, and the panel shows only its output.
- **Exact Claude Code models:** the model list now offers Default, Best available, Opus, "Opus for planning, Sonnet to build" (opusplan), Sonnet, Haiku, Fable, the 1M-context variants, and the full ids `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1`, and `claude-haiku-4-5-20251001`. "Custom model…" accepts any id the installed Claude Code knows, and a pinned id keeps showing in the picker. The safe-model pattern now allows the bracketed aliases such as `opus[1m]`.
- **Claude Code's own commands:** `/usage`, `/cost`, `/model`, and `/doctor` run through the CLI in Zenith's empty sandbox folder with no model call (`cli:claudeCommand`, allow-listed), and their output opens in a window with a copy button. Input is closed at once so the CLI doesn't wait on a pipe.
- **Verified in the packaged app:** a running `node` command received a line typed in the terminal and answered it; the Tests tab showed the label, Run, and results; `/usage` printed the real subscription limits; and the model picker pinned `claude-opus-5`, which Claude Code accepted for the next message.

## A real terminal (implemented 2026-09-16)

- **Why:** the plain command runner could not run prompts, colors, or full-screen programs; the user asked for an actual terminal.
- **How:** `node-pty` gives the Terminal panel a pseudo-terminal running the user's own shell (`$SHELL -l`, `cmd.exe` on Windows) in the project folder, with `TERM=xterm-256color`. `pty-terminal.ts` owns the sessions; `terminal:start`, `terminal:write`, `terminal:resize`, and `terminal:stop` carry them, and output arrives as `terminal:data`. The window renders with xterm.js (`TerminalView.tsx`), which fits itself to the panel and tells the shell the new size, and takes its colors from the current theme.
- **Native module:** the project's npm config sets `ignore-scripts`, so `node-pty` is built explicitly (`npm rebuild node-pty --ignore-scripts=false`) and rebuilt for Electron by Forge's rebuild step; `.node` and `spawn-helper` are unpacked from the ASAR. If the module can't load, `terminal:available` is false and the panel says so instead of failing.
- **The plain runner stays** for the Tests panel, which shows results only; its standard-input path, added earlier the same day, is gone with it.
- **Verified in the packaged app:** the user's zsh prompt appeared in the project folder, `git status --short && echo PTY-OK` ran, ANSI colors rendered, `vim NOTES.md` drew its full screen and quit cleanly, and expanding the panel changed the shell's size to 38 lines by 133 columns. Integration tests cover start, data both ways, clamped resizes, exit, a folder outside the project, and the missing-module case.

## Week plan A, day 1: context inspector, export, branching (implemented 2026-09-17)

- **Context inspector:** every request's context is recorded in the main process (`context-snapshot.ts`) the way the connection assembles it: Zenith's agent prompt, soul, profile, role, memory, agent and plan text, the project's `AGENTS.md` and `CLAUDE.md`, the tool definitions the agent was offered (or Claude Code's allowed tools), earlier conversation, and the latest message, each with a token estimate. "What the model saw" (pane menu, run inspector, `/context`) shows the last one. Connections that add their own hidden instructions (Claude Code, Gemini CLI, Copilot CLI, Hermes Agent, OpenCode) say so, and MCP tools are noted as added on top.
- **Export:** "Export as Markdown…" and "Export as web page…" (pane menu, `/export markdown|html`) save through the system dialog. The page has no scripts and a policy that loads nothing from outside.
- **Branch into a new session:** a message's actions now include "Branch into new session", which copies the conversation up to that message, with the same connection, model, folder, role, and memory, into a new session.
- **Fixed:** user-added providers ("custom:…") now get an undo snapshot before agent replies in a project folder, like the built-in API providers.
- **Verified:** tests cover the snapshot sections for Zenith's agent (plan mode offers only reading tools), for Claude Code as chat and as agent, and the Markdown and HTML exports (no scripts, escaped title). In the packaged app, a stand-in LM Studio agent turn showed about 1.5k tokens from Zenith, 1.3k of them tool definitions, and branching opened "Day one check (branch)" with the reply. The export save dialog is a native window and was not driven by the test.

## Week plan A, day 2: pasted images (implemented 2026-09-17)

- **Attaching:** paste, drop, or pick (image button in the composer) PNG, JPEG, GIF, or WebP images, up to six per message and 5 MB each, with removable previews. Images show in the message afterwards, and retry keeps them.
- **Storage:** images are saved once in the user data folder under a name made from their SHA-256 (`attachments.ts`); messages keep only references (schema v10 adds `messages.images`). Only names the store made itself can be read back.
- **Sending:** the window sends references; the main process loads the data just before the request and shapes it per API (`providers/content.ts`): `image_url` parts for OpenAI, OpenRouter, Ollama, LM Studio, and OpenAI-compatible providers; base64 `image` blocks for Anthropic and Anthropic-compatible providers; content blocks through `--input-format stream-json` for Claude Code, in chat and agent mode (images on the latest message). Zenith's own agent passes them to its model too.
- **Refusal:** Gemini CLI, Copilot CLI, Hermes Agent, and OpenCode don't take images yet; the composer says so before sending, and the main process refuses such a message with the same explanation. The context inspector notes how many images the last message carried.
- **Verified:** tests cover the store (deduplication, type, size, and name checks), images surviving a session save, the OpenAI and Anthropic shapes, Claude Code's JSON input, references in outgoing messages, the connection list, and an image arriving in a stand-in OpenAI-compatible server's request. In the packaged app, an image dropped into the composer showed a preview, appeared in the sent message, and reached the stand-in LM Studio as an `image_url` part. No live model was called, so a real Claude Code image request is still unchecked.

## Week plan A, days 3–4: sandboxed commands (implemented 2026-09-17)

- **Setting:** Settings → Plugins → Sandboxed commands (off by default), with the sandbox this system offers named, or a note when there is none.
- **Zenith's own agent:** `Bash` runs through macOS Seatbelt (`/usr/bin/sandbox-exec`) or, on Linux, bubblewrap when `bwrap` is installed (`agent/sandbox.ts`). The profile denies all network except loopback — which also blocks DNS and other Unix sockets, so names can't carry data out — and denies writes except in the project, a sandbox temp folder under the user data folder (also `TMPDIR`), and `/dev` basics. Reading is unrestricted. Paths reach the Seatbelt profile as `-D` parameters, so a folder name can't alter it.
- **Approvals:** sandboxed commands run without asking (a matching ask or deny rule still wins; paths that leave the project still ask). A failed sandboxed command's result tells the model it may retry with `outside_sandbox: true`, which always asks, even after "allow all", with the title "Run a command outside the sandbox" and a warning. Actions read "Run in sandbox: …".
- **Claude Code:** with the setting on, it starts with `--settings` enabling its own sandbox: sandboxed commands auto-allowed, no allowed network hosts under a strict allowlist, and retries outside the sandbox going through Zenith's approval.
- **Verified:** on this Mac, real Seatbelt runs allowed writes in a project whose name has quotes and parentheses, blocked a write next to it, refused a remote connection (EPERM) and a DNS lookup (ENOTFOUND) while loopback worked, and wrote outside only with `outside_sandbox`. The agent test ran a sandboxed command without a prompt and asked before leaving the sandbox; the Claude Code test checked `--settings` appears only when sandboxing is on. In the packaged app, turning the switch on let a stand-in agent's `echo hi > inside.txt; curl …` run without a prompt, write the file, and report `NET-BLOCKED`. Claude Code's own sandbox was not run live, and bubblewrap was not available to test here.

## Week plan A, day 5: more ACP agents and save as skill (implemented 2026-09-17)

- **Agents:** `AGENTS` in `connections.ts` now carries each agent's executable and ACP arguments, taken from the official registry (`cdn.agentclientprotocol.com/registry/v1/latest/registry.json`, read once while building this list, never at run time): Goose, Codex (`codex-acp`), Cursor Agent, Kimi CLI, Kilo, Qwen Code, Auggie, Cline, Grok Build, Devin, Junie, Mistral Vibe, Amp, Factory Droid, and Pi, besides Hermes Agent and OpenCode. The extra agents are listed only when installed and are not started to read a version; Zenith never installs one (the registry's `npx` and download distributions are not used). They appear under Agents in the pane's provider menu, snapshot before replies, and are refused by bots and scheduled tasks like the other agents.
- **Gemini CLI and Copilot CLI:** in a project folder they now run as ACP agents (`gemini --acp`, `copilot --acp`) with Zenith's approvals and undo; without a folder they stay read-only chats. The folder button is available for every connection.
- **Save as skill:** "Save as skill…" on a reply opens Settings → Skills with a draft named after the session, described by the request, and holding the reply under "What worked before" plus a steps section to edit before saving.
- **Verified:** a unit test checks that uninstalled extra agents are hidden, installed ones are ready, and only always-listed agents are asked for a version. Live, the real `copilot --acp` and `gemini --acp` each completed the ACP handshake and opened a session (no prompt sent). In the packaged app, "Save as skill…" produced the draft and saved `/day-one-check`. None of the extra agents are installed here, so their launch arguments are checked against the registry only.

## Terminal-shaped transcript, dispatch facts, and a prompt queue (implemented 2026-09-21)

Ideas taken from reading Amoeba 1.130.0 (a VS Code fork with a coordination daemon) in an isolated
profile: its rooms read 1:1 like the CLI they drive, its composer states what a send will do before
it happens, and a prompt written during a run is queued instead of refused. The cloud parts of that
product — accounts, a server-brokered GitHub token, multiplayer lanes, telemetry — stay out of
Zenith by principle.

- **Transcript:** a prompt keeps its own band in the scrollback (`❯`, left rule), a reply carries a
  quiet line naming the connection that wrote it, and each tool call is a terminal line: a status
  bullet, the verb, what it acted on, a `└ $ command` line for shell commands, and the result under
  `⎿`, red when the call failed or was denied. New rows rise in unless the system asks for reduced
  motion. The action list sits on a left rule instead of a floating card, so one turn reads as one
  column.
- **Dispatch facts:** under the composer, three chips say which connection answers, which folder it
  may touch (or "no folder · chat only"), and how much it may do without asking ("asks before
  changes", "sandboxed commands", or "plan only"). While a reply runs, that row becomes one status
  sentence — the running action's title, or "waiting for your approval".
- **Queue:** a prompt sent during a run is held (`useHarness`: `queuePrompt`, `cancelQueue`,
  `queuedPrompt`) and goes on its own as soon as the last reply ends, shown as a cancellable
  "Queued · …" chip. The send button reads "Queue" while a reply is running, beside Stop.
- **Jump to latest:** reading back through a long run shows a button that returns to the newest
  output and re-arms the stick-to-bottom scroll.
- **Verified:** the first component tests in the repo (`tests/component/transcript.test.tsx`) cover
  a failed sandboxed command's row and the composer's facts, queue chip, and Queue button. In the
  packaged app, driven by a stand-in `claude` binary on `PATH` (no quota spent), a turn showed
  `Run` with `└ $ npm test -- --silent` and `⎿ 2 suites failed` in red, `Read src/main/ipc.ts`,
  `Edit README.md`, the reply under "CLAUDE CODE", "waiting for your approval" in the composer, and
  a prompt queued during the run that started its own turn after the approval.

## Guardrails: one choice instead of a rules file (implemented 2026-09-21)

Read `studioKjm/ai-harness-template` (v2.6.0) for reference. Its core claim is that guardrails
belong in structure, not in prompts: boundary presets (strict / standard / permissive), blocking
gates, and a feedback loop that turns violations into rules. Zenith already had the enforcement;
what it lacked was a way to choose a posture without writing rule lines.

- **Postures** (`shared/permissions.ts`): `POSTURES` holds three complete rule sets — Locked down
  (asks before every change and command), Standard (the project's own checks run freely; changes,
  pushes and resets ask; `rm -rf` denied), Open (edits and commands run; push asks; `rm -rf` and
  `git reset --hard` denied). All three deny reading `.env`, `.pem`, `id_rsa*` and running `sudo`.
  `postureOf(text)` recognises a posture regardless of comments or spacing, so hand-written rules
  stay "custom".
- **Settings → Guardrails** (renamed from Plugins): the posture cards come first, then sandboxed
  commands, then MCP servers. Choosing a card writes the rules; the hand-written editor is still
  there under "Write the rules yourself", and a note says when your own rules match no posture.
- **Composer:** the third dispatch chip now names the posture in force ("locked down", "standard",
  "open"), with its summary on hover, and still shows "plan only" or "sandboxed commands" when
  those override it.
- **Verified:** unit tests check that every posture parses, that all three deny reading `.env`,
  and that each one decides what its summary promises; `postureOf` ignores comments and rejects
  unrelated text. A component test covers the chip. In the packaged app, choosing Standard wrote
  the rules (`deny Read *.env` first), marked the card in use, and the composer chip changed to
  "standard".

## Checks after a reply, and rules written by denying twice (implemented 2026-09-21)

Two more ideas from `studioKjm/ai-harness-template`: gates that run over what changed, and a
feedback loop where a violation becomes a rule. Both are local, and neither blocks anything on its
own — Zenith reports, the person decides.

- **Gate strip** (`main/gates.ts`, `GateStrip` in `AgentPanel.tsx`): when a reply that used tools
  ends in a project folder, three checks run over the files Git reports as changed and appear as
  chips under the action list.
  - **Secrets:** named patterns (Anthropic/OpenAI, GitHub, AWS, Google, Slack, private keys, and
    keys written into code) over changed text files, skipping build folders, binaries, files over
    256 KB, and lines that read as placeholders. Findings say `file:line: looks like …`.
  - **Errors:** the project's language server, the same one used after an approved edit, over up
    to ten changed files it covers; "skipped" when no server covers them (`servedByLanguageServer`).
  - **Scope:** how many files changed, failing above fifteen — their "surgical changes" gate.
  - Clicking a chip shows its findings; **Ask the agent to fix** sends them back as the next
    prompt (`shared/gates.ts`), so nothing is copied by hand.
- **Deny twice, write the rule:** a permission prompt now carries the tool and the same subject a
  rule is matched against (`ruleSubject`). Deny something once and the next time the card offers
  **Deny and never ask again**, which appends `deny Bash git push*` (commands: first two words) or
  `deny Edit README.md` (paths) to the rules and answers the prompt. ACP agents keep their own
  permissions and don't set these fields, so no button appears for them.
- **Verified:** unit tests cover the rule text, that a written rule then denies the same command,
  and which option answers a denial; integration tests cover a planted key found at `file:line`,
  clean files and placeholders passing, language-server errors, a sixteen-file change failing
  scope, and the "skipped" cases. In the packaged app, a turn against a folder holding a planted
  key showed `✗ Secrets · ✓ Errors · ✓ Scope` with `leak.ts:1`, "Ask the agent to fix" sent the
  findings as the next prompt, and denying the same edit twice offered the rule, saved
  `deny Edit README.md`, and the third attempt was refused without asking.

## A second opinion on the changes (implemented 2026-09-21)

The reference template's newest gate (`check-security-ai.sh`) asks a _separate_ model to look for
vulnerabilities, on the grounds that the model which wrote the code will defend it. Zenith already
runs several connections, so the reviewer can simply be a different one.

- **Review with <connection>** sits beside the checks after a reply. It sends one plain chat
  request — no project folder, so the reviewer gets no tools — carrying a fixed system prompt and
  the patch: `git diff HEAD` plus new files' contents, capped at 60,000 characters (`main/review.ts`).
- The reviewer is picked in the window: a ready connection that brings its own model and is **not**
  the one that wrote the change; it falls back to the same connection only when nothing else is
  ready, and the button disappears when none is.
- The prompt asks for `VERDICT: clean` or `VERDICT: findings` followed by severity / where /
  problem / fix blocks, and for security only. Anything else reads as **unclear**, never as
  approval (`reviewVerdict`). The chip turns ✓, ✗ or –, and its panel shows the answer as it came.
- It costs one request, so it only runs when clicked.
- **Fixed on the way:** `createProviderRegistry` kept the _last_ adapter registered for an id.
  Gemini CLI and Copilot CLI are registered twice — once as the chat-or-agent wrapper, once as a
  plain ACP agent — so their chat requests were going to ACP, which fails outside a project folder
  ("The agent exited (code 0)"). The registry now keeps the first adapter for an id, and the two
  ACP adapters are held in their own list for disposal.
- **Verified:** unit tests cover the verdict parsing (case, spacing, "unclear" for anything else)
  and the registry's first-wins rule; an integration test builds a real repository and checks the
  patch carries both changed and new files and is empty on a clean tree. In the packaged app, with
  stand-in `claude` and `copilot` binaries on `PATH` (no quota spent), a turn showed
  `✗ Secrets · ✓ Errors · ✓ Scope`, then "Review with Copilot CLI" returned `VERDICT: findings`
  with `WHERE: leak.ts:1` and the chip turned `✗ Review`.

## Goals page matches the rest of the app (2026-09-21)

Small consistency pass, no behavior change: the Goals page drew its own small title instead of the
`PageHeader` every other page uses, and its content stretched the full window. It now carries the
standard header ("Kept between sessions" / Goals / what it is for) and sits in the same measured
column as Settings and the library pages. The progress slider was drawing in the system blue, the
only blue in the window; it now follows the theme's primary colour (`accent-primary`).

Also fixed: the component test's `window.zenith` stub had no `voice.status`, so the dictation hook
added in the same period made `tests/component/transcript.test.tsx` fail. Stub added; the suite is
green again (150 unit, 101 integration, 2 component).

## A built-in browser (2026-09-24)

**Browser** sits in the left rail below Files: back, forward, reload or stop, an address field and
"Open in your browser", over a real web page. Text that looks like an address loads (with
`https://` added when there is no scheme); anything else searches DuckDuckGo (`addressToUrl` in
`shared/browser-address.ts`).

- **One native view, not `<webview>`.** `main/browser-view.ts` keeps a single `WebContentsView` on
  the main window's `contentView`, made on the first navigation. The window sends the rectangle of
  its page area (`ResizeObserver` plus window resize, whole pixels), and the view sits exactly over
  it. It is separate from the agent's pages in `main/browser.ts`.
- **Kept apart from Zenith:** its own `persist:zenith-browser` session, so sites never share
  cookies or storage with the app; sandboxed, context isolation on, no Node, no preload, no
  `<webview>`. Only http, https and `about:blank` load — from the address field, links, redirects
  and new windows alike. A link that opens a new window opens in the same view. Every permission
  (camera, microphone, location, notifications, MIDI, links into other apps…) is refused, and a
  download always asks where to save.
- **Native views draw over everything,** so the view is hidden when another page is open, and while
  any Radix dialog, popover, menu or select list is open (a `MutationObserver` watches for
  `[data-state=open]` with those roles). Leaving the page only hides the view, so the page and its
  history are there on the way back. It is destroyed when the window closes.
- **Verified:** unit tests for the address rules and the scheme allow-list; an end-to-end test
  serves two pages from a local `http.createServer`, loads both from the address field, checks the
  title in the breadcrumbs and the URL in the field, walks back and forward, leaves and returns,
  and has `file:` refused. In the running app, example.com loaded exactly under the toolbar, the
  History dialog drew over an empty area with the page hidden, and the page followed a window
  resize and the bottom panel. From inside the page, location, microphone and notifications were
  denied, `window.open` loaded in the same view, and `window.zenith` and `require` were undefined.

## Session tabs (implemented 2026-09-24)

On the Workspace, the top bar's breadcrumb gave way to Safari-like tabs, one per open session
(`SessionTabs.tsx`, with the list rules in `tabList.ts`). Other pages keep their breadcrumb.

- A rail click, History, a branch, or a new session opens the session in a tab, or focuses the tab
  it already has. The open tab looks raised, shows the running or waiting dot, and renames inline
  on a double-click; the others show a close button on hover. Many tabs scroll, keeping the open
  one in view.
- Closing a tab keeps the session in the rail and focuses the tab to its right (or left when it
  was last). Closing the last tab opens a new empty session. Deleting a session closes its tab.
- The tabs and their order are kept in `localStorage` (`zenith.sessionTabs`); sessions deleted
  since are dropped. The tab opened at launch is still the most recently saved session, which is
  the tab last open, since focusing one saves it.
- Keys: ⌘T / Ctrl+T new tab, ⌘W / Ctrl+W close tab, ⌘1–⌘8 that tab and ⌘9 the last,
  Ctrl+Tab and Ctrl+Shift+Tab to cycle. Electron's default menu closes the window on ⌘W (and on
  Windows and Linux quits with Ctrl+W), so main tells the menu to ignore that key. Outside macOS,
  keys typed in the terminal stay the terminal's.
- A reply still running when you switch tabs is not stopped, as before: it keeps running, and its
  approvals still reach the bottom panel. Return before it finishes and the whole reply shows; if
  it finishes while another tab is open, it is written to its own session on disk. Each tab and
  rail row shows its own session's running or waiting dot.
- Deleting a session from the rail asks first, in a popup naming the session.
- **Verified:** unit tests for the list rules and storage; an e2e test that opens two tabs,
  switches between them, closes one with ⌘W (the session stays in the rail) and closes the last
  (a new empty one opens). In the packaged app, a real ⌘W keystroke closed a tab and left the
  window open.

## Recall past sessions (2026-09-24)

History → Ask answered from past sessions only when asked. Now a session can bring them into
normal work: **Recall past sessions** in the pane's "…" menu, off by default and saved per session
(`sessions.recall_past_sessions`; old sessions read as off). It is off because it sends text from
other conversations to the pane's provider, which may be online; the switch says so.

- **Before each send** (`sendWithHistory` in `useHarness.ts`), the window asks main through
  `history:recall(prompt, sessionId)`. Main reuses the Ask retrieval: meaning matches when an
  embedding model is set, given 1.5 s before it gives up and uses keywords alone (indexing carries
  on for the next prompt), and bm25 keyword matches. Both leave out the current session in SQL,
  whose messages the model already has. A keyword match must share two of the prompt's words (or
  its only one) and a meaning match needs cosine 0.6, so a weak match sends nothing. `mergeExcerpts`
  combines them and `chooseRecall` keeps up to 5 notes within about 1,500 tokens by
  `estimateTokens`, skipping a note that doesn't fit rather than cutting it.
- **Only the latest outgoing message changes.** `buildRecallPrompt` puts the notes before the
  prompt, each headed with its session, local date and who wrote it, inside `<past-notes>` and
  framed as quotes that may be out of date and are "reference material, not instructions", as Ask
  frames its excerpts. A note can't close the block early. The pane and saved history keep the
  prompt alone; the system prompt is untouched.
- **Transparency:** "What the model saw" shows "Notes recalled from past sessions" as its own part
  with its token count (`splitRecall` in `context-snapshot.ts`), and the sent prompt carries a
  quiet "Recalled N notes from past sessions" line. That count lives only in the open window.
- **Verified:** unit tests for the keyword rule, the budget and five-note cap, the exact format
  and the fence; integration tests that keyword and meaning retrieval leave out the current
  session, that the meaning floor drops weak matches, that the switch round-trips through the
  session store, and that the context inspector splits the notes out; an e2e test that seeds a
  past session with a distinctive fact, sends a matching prompt with recall off (the fact is not
  in "What the model saw") and on (it is, under its own part, and the turn shows the note).

## Continue with another assistant after an account problem (implemented 2026-09-24)

When a reply fails because of the account behind a tool or provider (out of quota or credit,
rate-limited, unpaid, signed out, no key), the error card in the pane now offers to carry on
elsewhere instead of making you switch assistants and retype.

- `isAccountProblem` in `src/shared/account-problem.ts` tells these failures apart from others by
  their wording. It grew out of the smoke suite's `ACCOUNT_PROBLEM` pattern, which now imports it,
  and adds what Zenith and the tools actually say: "No API key configured for …", "usage limit
  reached", "hit your limit", `rate_limit_error`, "credit balance", "Insufficient credits",
  "payment required". A crash, an overloaded server or an unreadable image is not one.
- The card shows **Continue with Claude Code** (the first other ready assistant) and, when there are
  more, an **Another assistant** menu. A line under the error says the new assistant gets this
  conversation, not the failed tool's own tool steps. Retry and Add API key stay as they were.
- A click switches the pane's provider and model, then resends the failed prompt with the same
  history through `retryPane`, which now takes the provider and model to switch to. Zenith owns the
  conversation, so nothing is retyped and nothing is lost.
- It never happens on its own: nothing is sent to an assistant the person didn't pick. API
  providers aren't offered, because they need a model chosen first, and that choice sets what the
  reply costs; they stay one pick away in the composer.
- **Verified:** unit tests with real error strings from the code and the providers, and messages
  that must not match. An e2e test runs a first turn on the stand-in Claude, switches to the
  stand-in Gemini (which answers as an account out of quota when `ZENITH_FAKE_QUOTA=1`), clicks
  Continue with Claude Code, and sees Claude's reply report the two earlier messages, with the
  prompt shown once. `launchApp` takes extra environment variables for this.

## Prompt caching for Anthropic requests (implemented 2026-09-24)

Every turn resends the whole conversation, and the native agent resends it on every tool step, so
Anthropic requests now mark what can be read back from Anthropic's prompt cache.

- Two of the four allowed `cache_control: {type: "ephemeral"}` breakpoints: the system prompt, now
  sent as one text block, which with the tools in front of it caches both; and the last block of
  the last message. The next request repeats that prefix and adds one turn (or one tool step), and
  Anthropic finds the earlier entry by looking back from the new breakpoint. That covers "the
  message before the new turn" without spending a third breakpoint on it. No beta header is needed.
- The helpers (`cachedSystem`, `withCacheBreakpoint`, `anthropicUsage`) live in
  `src/main/providers/content.ts` and are used by the chat adapter (`providers/anthropic.ts`) and by
  `anthropicModel` in `agent/models.ts`, which serves the native tool loop and the
  Anthropic-compatible custom providers.
- `TokenUsage` gains optional `cacheReadTokens` and `cacheWriteTokens`, filled from the response's
  `cache_read_input_tokens` and `cache_creation_input_tokens` and summed across tool steps.
  `inputTokens` still counts the whole prompt. The chat adapter now reports usage at all, which it
  didn't before. The window doesn't show the cache counts yet.
- OpenAI and OpenRouter need no change: OpenAI caches long prefixes by itself, and both get the
  system prompt first and the history in order, the same on every turn.
- Prompts under Anthropic's minimum cacheable length (about 1,024 tokens, more for some models)
  simply aren't cached; nothing fails.
- **Verified:** the adapter's unit tests check the breakpoints in the request body, that earlier
  turns go unchanged, and the cache counts in the reported usage; the native agent's integration
  test checks the breakpoints on a tool step and the summed cache counts.

## Continuing the agent's own session (implemented 2026-09-24)

CLI agents used to start fresh every turn with the whole conversation flattened into one prompt
(`buildCliPrompt`), so each turn paid for everything again and the agent's own cache never helped.
Now a pane whose conversation is unchanged since its last turn continues the agent's session and
sends only the new message.

- **The window decides.** `useHarness` remembers each pane's last clean turn (`LastTurn` in
  `shared/conversation.ts`: connection, model, folder, message count, last message id) and sends
  `resumeFrom` only when the history about to go out matches it (`resumeFrom()`). Undo, restore,
  retry, branch, clear and a provider, model or folder switch all fail that check, and a restart
  forgets everything. Starting any turn clears the record, so an error or a stop mid-turn leaves
  nothing to continue; compaction and undoing file changes clear it too, since the agent's session
  would still hold the old history or the old files.
- **Main keeps the session** per pane (`cli/agent-sessions.ts`) and continues it only when
  `resumeFrom` names the turn it recorded and the model, folder and instructions (persona, memory,
  agent, plan mode, compaction summary) are unchanged; otherwise it sends the full transcript.
  If continuing fails before anything reaches the pane, the same turn is sent again with the full
  transcript (`resumeOrReplay`).
- **Claude Code**, agent mode and chat: a pane's turns are saved (no `--no-session-persistence`,
  so they also appear in Claude Code's own session list for that folder) and continued with
  `--resume=<session_id>` from the `system`/`init` or `result` message, in the same folder. Every
  other flag is the same as a first turn, including `--permission-prompt-tool stdio`, so every edit
  and command still asks Zenith; Claude Code keeps no approvals between runs. One-off requests
  (compaction, bots) still run without saving.
- **ACP agents** (Gemini and Copilot in a folder, Hermes, OpenCode, and the rest) keep their
  process and send `session/prompt` on the pane's session with only the new message. Permission
  requests are routed by session id to the turn that sent the prompt. The process closes ten minutes
  after the last turn and on quit; the next turn opens a new session with the transcript. This
  replaces the earlier history fingerprint, which never matched when the prompt sent differed from
  the one shown (a skill, say).
- **Plain Gemini CLI and Copilot CLI chats are left out**: Gemini's `--resume` takes only "latest"
  or an index, which races between panes, and Copilot's could not be checked without spending quota.
- "What the model saw" shows only the newest message for a continued turn and says why; usage
  estimates count only what was sent.
- **Verified:** unit tests for the window's decision, the session store and the fallback; integration
  tests with the stand-in Claude Code (second turn has `--resume` and only the new message, a changed
  persona or a refused resume sends the transcript) and the fake ACP agent (continuing, a lost
  session, approvals, idle close); an e2e test with two turns that continue, then a restore after
  which the next turn sends the transcript. A live two-turn Claude Code check (haiku, agent mode)
  continued the same session: the first turn wrote 13,638 tokens to the cache, the second wrote 92
  and read the rest from it.

## File tabs on the Files page (implemented 2026-09-25)

The Files page kept one file open at a time. Now each file opens in a tab above the reader
(`FilesView.tsx`), with the list rules shared with the session tabs (`tabList.ts`) and the few
that differ in `fileTabs.ts`.

- Every click in the tree opens the file in a tab, or focuses the tab it already has; a link in a
  Markdown page does the same. There is no VS Code-style preview tab that a single click replaces.
- The strip looks like the session tabs: compact, the open tab raised, a close button, middle-click
  to close, and a scrolling strip that keeps the open tab in view. A tab shows the file name, and
  its folder too when another open file has the same name.
- Every open tab stays mounted and the others are only made invisible, so each keeps its own view
  (Read, Preview, Source), preview width and scroll position, inside a preview too, without saving
  and restoring them. Many open previews each keep their frame alive.
- Keys while the Files page shows: ⌘W / Ctrl+W closes the file tab, ⌘1–⌘8 that tab and ⌘9 the
  last, Ctrl+Tab and Ctrl+Shift+Tab cycle. App.tsx's tab-key handler leaves every key but ⌘T to
  the Files page when it is open, so they never reach the session tabs.
- The tabs, their order and the open one are kept per project folder in `localStorage`
  (`zenith.fileTabs:<folder>`). On restore, a file deleted since loses its tab, found by listing
  each file's folder. Switching the project folder shows that folder's own tabs.
- **Verified:** unit tests for closing, labels and storage; an e2e test that opens three files,
  switches between them, closes one with ⌘W, switches with ⌘2 and Ctrl+Tab, then restarts with a
  file deleted and finds the rest of the tabs as they were.
