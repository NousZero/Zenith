# Zenith

One desktop app for every coding assistant you already use.

Zenith is an Electron workbench that runs Claude Code, Hermes Agent, OpenCode, Ollama, LM Studio
and any OpenAI-compatible or Anthropic-compatible API in a single window — with its own agent
loop, approvals before anything changes, a real terminal, Git, file previews, skills, bots and
scheduled tasks.

It runs on your computer. Conversations, keys and settings stay in your user data folder, and
Zenith uses the sign-ins the command-line tools already have instead of asking for new ones.

---

## What it does

### Talk to any model

- **Command-line tools you have installed:** Claude Code, Gemini CLI, Copilot CLI — Zenith reuses
  their own sign-in, so there is no extra key to paste.
- **Local servers:** Ollama and LM Studio, detected automatically.
- **Agents over ACP:** Hermes Agent and OpenCode, plus Goose, Codex, Cursor Agent, Kimi, Kilo,
  Qwen Code, Auggie, Cline, Grok Build, Devin, Junie, Mistral Vibe, Amp, Factory Droid and Pi when
  they are installed. Gemini CLI and Copilot CLI become full agents in a project folder. Zenith
  never downloads an agent; it runs the ones already on the computer.
- **Your own API providers:** add a name, an API type (OpenAI-compatible or Anthropic), a base
  URL, a key and optional model ids. Keys are encrypted with your operating system's secure
  storage and never shown again.
- **Exact models:** Claude Code accepts aliases (`opus`, `sonnet`, `opusplan`, `opus[1m]`) or a
  full id such as `claude-opus-5`, typed into the pane's model picker.

### Work in a project folder

Point a conversation at a folder and the model becomes an agent that can read and change it.

- **Zenith's own agent loop** for API providers and local servers, with the tools `Read`, `Glob`,
  `Grep`, `Edit`, `Write`, `Bash`, `TodoWrite`, `Remember` and `Task` (subagents).
- **Claude Code agent mode** runs as itself, asking Zenith for every action it can't take freely.
- **Approvals first:** edits show a diff, commands show the exact command line, and MCP tools ask
  before running. Anything that reaches outside the project folder — including through a symbolic
  link — always asks.
- **Sandboxed commands (optional):** agent commands run in the operating system's sandbox (macOS
  Seatbelt, Linux bubblewrap) with no network and writes only inside the project, so they don't
  need to ask. Leaving the sandbox always asks.
- **Guardrails in one choice:** Locked down, Standard or Open in **Settings → Guardrails** sets
  every rule; the composer names the one in force before you send. All three refuse to read
  `.env`, keys and `id_rsa*`.
- **Permission rules** for anything finer: `allow Bash npm test*`, `deny Read *.env`,
  `ask Edit src/*`. An allow rule never matches a chained shell command.
- **Undo** restores the project folder from a snapshot taken before the reply, so changes made by
  commands are covered too.
- **Formatting and diagnostics:** after an approved edit, Zenith runs the project's Prettier,
  Biome, `gofmt`, `rustfmt` or Ruff, then feeds the project's language-server errors back to the
  model so it can fix them.

### See what's happening

- **Transcript that reads like a terminal:** your prompt keeps its own `❯` band, each tool call is
  one line (`Run`, then `└ $ npm test`, then the result under `⎿`, red when it failed), and the
  reply says which connection wrote it.
- **Before you send:** the composer states which connection answers, which folder it may touch, and
  how much it may do without asking. While a reply runs it says what the agent is doing right now.
- **Queue a prompt:** type during a run and it waits as a cancellable chip, then goes on its own as
  soon as the reply ends.
- **Bottom dock:** a real terminal (your own shell in a pseudo-terminal, so `vim`, `less` and
  colors work), Tests (finds `npm test`, `cargo test`, `go test`, pytest), Git status, diffs,
  commits and worktrees, Logs of every tool call, and the Approvals queue.
- **Files page:** a project tree with a Markdown reading view, and previews of web pages and
  images at full, tablet or phone width. Previews run offline: a page can load files from the
  project and reach nothing else.
- **Checks after a reply:** when an agent changes files, Zenith checks them for leaked keys, for
  errors the project's language server reports, and for how far the change spread — then hands the
  findings back to the agent in one click.
- **A second opinion:** ask a _different_ connection to review the changes for security problems,
  with the patch and nothing else. One request, only when you click.
- **Deny twice, write the rule:** the second time you refuse the same action, the card offers to
  save it as a rule so it never asks again.
- **Run inspector:** soul, role, agent, skills, project, mode, context use and the task list for
  the current conversation.
- **What the model saw:** every part of the last request — instructions, project files, tool
  definitions, conversation — with token counts, and a note on what a tool adds that Zenith
  can't see.

### Keep and reuse your work

- **Images:** paste, drop or attach screenshots for Claude Code, API providers, Ollama and LM
  Studio.
- **Branch** a conversation into a new session from any message, and **export** it as Markdown or
  a self-contained web page.
- **Save as skill:** turn a reply that worked into a `/skill`, drafted for you to edit.

### Make it yours

- **Soul and profile:** `SOUL.md` sets who every model is; `USER.md` holds what they should know
  about you. Agents can add to your profile with your approval.
- **Skills, commands and agents** as Markdown files, shared with Claude Code, OpenCode and Hermes
  Agent layouts, run with `/name` in the composer.
- **Role:** a session personality, added after the soul and profile.
- **Themes:** Graphite, Midnight, Nord, Solarized, Rosé, Parchment and Paper.
- **MCP servers** from `mcp.json` add tools to every agent, including Zenith's own.

### Automate

- **Scheduled tasks:** run a prompt on a cron schedule while Zenith is open and get the result as
  a notification or through a bot.
- **Bots:** Telegram, Discord, Slack, WhatsApp (official Cloud API), Signal (signal-cli) and Home
  Assistant. People must pair with a code shown on the desktop, and bots answer through chat
  connections only — a remote message can never run a tool.
- **History:** search every past session, ask questions about it (optionally by meaning, with a
  local Ollama embedding model) and see token use by connection and model.

---

## Install and run

Requirements: **Node 24.17.0** and **npm 11.17.0** (see `engines` in `package.json`), and Git.

```bash
npm install
npm rebuild node-pty --ignore-scripts=false   # builds the terminal's native module
npm run dev                                    # start in development
npm run make                                   # build an app for this platform
```

Nothing else is required to start: Zenith finds the AI tools already installed on the computer.
Add API providers later in **Settings → Providers**.

> The repository sets `ignore-scripts`, so native modules are built on purpose rather than during
> install. `node-pty` is the only one.

### Verify a change

```bash
npm run verify   # formatting, lint, types, unit and integration tests
```

---

## How it keeps you in control

- The window is sandboxed, with context isolation, no Node integration, and a content security
  policy that allows no network access from the interface itself.
- Credentials are encrypted with the operating system's secure storage. Zenith never reads other
  tools' credentials or sign-in tokens, and never sends a key back to the window.
- Command-line tools used for plain chat run read-only in an empty Zenith-owned folder.
- Agents ask before edits, commands and MCP tools; rules can widen or narrow that, never silently.
- Scheduled tasks and bots are chat-only, because nobody is present to approve a tool.

The full model is in
[`docs/superpowers/specs/2026-09-15-harness-threat-model.md`](docs/superpowers/specs/2026-09-15-harness-threat-model.md),
including the risks that are accepted rather than solved.

---

## Project layout

| Path                              | What lives there                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/main`                        | Electron main process: connections, agents, tools, Git, terminal, bots, scheduler, database |
| `src/renderer`                    | React interface: workspace, files, settings, dock, dialogs                                  |
| `src/preload`                     | The small, typed bridge between them                                                        |
| `src/shared`                      | Types and pure logic used by both sides                                                     |
| `tests/unit`, `tests/integration` | Vitest suites, including fake CLIs, servers and language servers                            |
| `docs/superpowers/specs`          | Current design notes, roadmap and threat model                                              |
| `PRD.md`                          | What Zenith is for, who it serves, and what "done" means                                    |

[`AGENTS.md`](AGENTS.md) is the guide for anyone changing the code. `SPEC.md`, `PLAN.md`,
`docs/decisions/`, `docs/operations/` and `tasks/` describe an earlier Windows-only workbench
design that was replaced in September 2026, and are kept only as history.

---

## Licence

MIT — see [`LICENSE`](LICENSE).

## Status

Zenith is developed and tested on macOS (Apple silicon). The code is cross-platform and packaging
targets Windows, macOS and Linux, but Windows and Linux have not been verified yet, and packages
are not signed. See [`PRD.md`](PRD.md) for what is finished and what is next.
