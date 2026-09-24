# Zenith

> Run any coding agent on your project, safely, and keep only the changes you want.

Zenith is an Electron desktop app that runs the coding assistants you already have — Claude Code,
Gemini CLI, Copilot CLI, Hermes Agent, OpenCode, sixteen more agents over ACP, local models
through Ollama and LM Studio, and your own API keys for Anthropic, OpenAI and OpenRouter — against
a project folder, with approvals, sandboxing and undo around every one of them.

It runs on your computer. Conversations, keys and settings stay in your user data folder, and
Zenith uses the sign-ins the command-line tools already have instead of asking for new ones.

<!-- Screenshot to add: Zenith workspace — empty state with a first-run checklist -->

---

## The core loop

1. **Pick a folder.** Point a conversation at a project; the model becomes an agent that can read
   and change it.
2. **Ask.** Type a prompt, or send one of the suggested first tasks from the first-run checklist.
3. **Watch.** A pinned plan strip shows the agent's steps while it works; each tool call is one
   compact line with an icon and how long it took.
4. **Review.** Edits arrive as a diff to approve; a review bar summarizes every file the reply
   touched.
5. **Keep or undo.** Keep the changes, undo all of them, undo a single file, or restore the
   project to any earlier prompt in the conversation.

Everything else in Zenith — scheduled tasks, bots, goals, dictation — sits outside this loop and
is off until you turn it on.

---

## What it does

### Talk to any model

- **Command-line tools you have installed:** Claude Code, Gemini CLI, Copilot CLI — Zenith reuses
  their own sign-in, so there is no extra key to paste. On Windows, agents that npm installs as
  `.cmd` shims (Gemini, Copilot, Hermes and others) are found and started directly, without a
  shell.
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

Point a conversation at a folder and the model becomes an agent that can read and change it. The
provider, model, folder and pane menu live in the chat box's controls row, not a separate header.

- **Zenith's own agent loop** for API providers and local servers, with the tools `Read`, `Glob`,
  `Grep`, `Edit`, `Write`, `Bash`, `TodoWrite`, `Remember` and `Task` (subagents).
- **Claude Code agent mode** runs as itself, asking Zenith for every action it can't take freely.
- **`@` file mentions** anywhere in the prompt, not only at the end of it, completed from Git's
  file list or — in a folder with no Git repository — a direct folder walk.
- **A grouped `/` menu** of Zenith's own commands, your skills and your commands, typed into the
  composer.
- **A pinned plan strip** above the composer while an agent works, expandable to the full list of
  steps with their status.

### Safety

- **Guardrail postures in one choice:** Locked down, Standard or Open in **Settings → Safety**
  sets the whole rule set at once; the composer names the one in force before you send. All three
  refuse to read `.env`, keys and `id_rsa*`.
- **Permission rules** for anything finer: `allow Bash npm test*`, `deny Read *.env`,
  `ask Edit src/*`. An allow rule never matches a chained shell command. Deny an action twice and
  the card offers to save it as a rule so it never asks again.
- **Approvals with diffs:** edits show a diff, commands show the exact command line, and MCP tools
  ask before running. Anything that reaches outside the project folder — including through a
  symbolic link — always asks.
- **Sandboxed commands (optional):** agent commands run in the operating system's sandbox (macOS
  Seatbelt, Linux bubblewrap) with no network and writes only inside the project, so they don't
  need to ask. Leaving the sandbox always asks.
- **Checks after edits:** when an agent changes files, Zenith checks them for leaked secrets,
  language-server errors, and how far the change spread, then hands the findings back to the agent
  in one click.
- **A second opinion:** ask a _different_ connection to review the current patch for security
  problems, with the patch and nothing else. One request, only when you click.
- **The review bar:** Keep, Undo all, or undo a single file from its chip.
- **Restore to here:** roll the project and the conversation back to any earlier prompt.
- **An audit log** of approvals, commands, edits, undos and checks, secrets masked before writing,
  in **Settings → Safety → Activity record**.
- **Atomic file writes:** every write Zenith makes goes through a temporary file and a rename, so
  a crash never leaves a file half-written.
- **Provider requests refuse redirects and require https** unless the address is local — a
  redirect can otherwise carry an API key to a different host.
- **A local error log** at `<userData>/logs`, and a **Report a problem** action in
  **Settings → Safety** that copies the app, OS and Electron versions plus the last ~200 log lines
  to the clipboard. Nothing here leaves the machine unless you copy or save it yourself.

### See what's happening

- **A first-run checklist** in the empty workspace: the assistant is ready (or isn't, with a link
  to fix it), a project folder is chosen, and a first task is offered as small suggestions that
  fill the chat box.
- **Transcript that reads like a terminal:** your prompt keeps its own `❯` band, each tool call is
  one line (`Run`, then `└ $ npm test`, then the result under `⎿`, red when it failed, paths
  always shown with forward slashes), and the reply says which connection wrote it.
- **If an ACP agent goes quiet** — waiting on its own model provider, for example — Zenith shows
  its latest stderr warning in place of "thinking…" after 15 seconds. Claude Code and the plain
  CLIs aren't covered yet.
- **Queue a prompt:** type during a run and it waits as a cancellable chip, then goes on its own as
  soon as the reply ends.
- **Bottom dock:** a real terminal (your own shell in a pseudo-terminal, so `vim`, `less` and
  colors work), Tests (finds `npm test`, `cargo test`, `go test`, pytest), Git status, diffs,
  commits and worktrees, Logs of every tool call, and the Approvals queue.
- **Files page:** a project tree with a Markdown reading view, and previews of web pages and
  images at full, tablet or phone width. Previews run offline: a page can load files from the
  project and reach nothing else.
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

### Extras

Goals, scheduled tasks, bots, dictation, screenshots and a project board sit outside the core
loop. Each has its own switch in **Settings → General → Extras** and is off by default — an extra
that's off leaves the rail, the composer, the folder menu and the `/` command list. An extra
already in use (a goal, an enabled bot, a scheduled task) starts on so nothing running disappears.

- **Goals:** standing goals tracked on their own rail page.
- **Scheduled tasks:** run a prompt on a cron schedule while Zenith is open, get the result as a
  notification or through a bot.
- **Bots:** Telegram, Discord, Slack, WhatsApp (official Cloud API), Signal (signal-cli) and Home
  Assistant. People pair with a code shown on the desktop, and bots answer through chat
  connections only — a remote message can never run a tool.
- **Dictation:** speak a message into the composer with a local Whisper model instead of typing.
- **Screenshot:** attach a picture of the screen from the composer's `+` menu.
- **Project board:** a kanban board for the pane's project folder.

**History**, outside the Extras list, always searches every past session, answers questions about
it (optionally by meaning, with a local Ollama embedding model), and shows token use by connection
and model.

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
Add API providers later in **Settings → Assistants**.

> The repository sets `ignore-scripts`, so native modules are built on purpose rather than during
> install. `node-pty` is the only one.

### Development

```bash
npm run verify           # formatting, lint, types, unit, integration and component tests
npm run test:e2e:build   # package the app, then run the Playwright end-to-end suite
npm run smoke:real       # package the app, then run every installed agent through one real task
```

`npm run verify` is the contract CI runs on every push. The Playwright suite
(`tests/e2e`, `playwright.config.ts`) drives the packaged Electron app against stand-in CLI
scripts, so it uses no real model quota. `npm run smoke:real` (`tests/smoke`,
`playwright.smoke.config.ts`) drives the real, installed agents — Claude Code, Gemini CLI, Copilot
CLI, Hermes — through one small task each with your own sign-ins and a little real quota; run it
by hand before a release, never in CI.

CI (`.github/workflows/ci.yml`) runs `npm run verify` on every push to `main` and every pull
request, on Linux, macOS and Windows — Linux and macOS block the build, Windows is reported but
not yet blocking. A separate macOS job packages the app and runs the Playwright end-to-end suite.

---

## Settings

Four tabs, each reachable from anywhere a "Manage" or "open settings" link appears:

| Tab                 | What's there                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **General**         | Appearance (theme) and Extras (the switches above, plus the Bots, Scheduled tasks and Usage insights cards) |
| **Assistants**      | Providers: connections, API keys, custom OpenAI-compatible and Anthropic-compatible providers               |
| **Agent behaviour** | Soul, Role, Agents, Skills and Commands, behind a sub-nav                                                   |
| **Safety**          | Guardrail posture, permission rules, sandboxed commands, MCP servers, the activity log and Report a problem |

---

## Project layout

| Path                                                 | What lives there                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/main`                                           | Electron main process: connections, agents, tools, Git, terminal, bots, scheduler, database |
| `src/renderer`                                       | React interface: workspace, files, settings, dock, dialogs                                  |
| `src/preload`                                        | The small, typed bridge between them                                                        |
| `src/shared`                                         | Types and pure logic used by both sides                                                     |
| `tests/unit`, `tests/integration`, `tests/component` | Vitest suites, including fake CLIs, servers and language servers                            |
| `tests/e2e`                                          | Playwright suite against the packaged app, driven by stand-in CLIs                          |
| `tests/smoke`                                        | Playwright suite against real, installed agents — run by hand, not in CI                    |
| `docs/superpowers/specs`                             | Current design notes, roadmap and threat model                                              |
| `docs/decisions`                                     | Architecture decision records, including why Zenith replaced its earlier codebase           |
| `PRD.md`                                             | What Zenith is for, who it serves, and what "done" means                                    |

[`AGENTS.md`](AGENTS.md) is the guide for anyone changing the code. `SPEC.md`, `PLAN.md`,
`docs/PROJECT-STATUS-AND-ROADMAP.md`, `docs/operations/` and `tasks/` describe an earlier
Windows-only workbench design, replaced on 2026-09-13 — see
[`docs/decisions/0008-zenith-replaces-agamemnon.md`](docs/decisions/0008-zenith-replaces-agamemnon.md).
They're kept only as history.

---

## How it keeps you in control

- The window is sandboxed, with context isolation, no Node integration, and a content security
  policy that allows no network access from the interface itself.
- Credentials are encrypted with the operating system's secure storage. Zenith never reads other
  tools' credentials or sign-in tokens, and never sends a key back to the window.
- Command-line tools used for plain chat run read-only in an empty Zenith-owned folder.
- Agents ask before edits, commands and MCP tools; rules can widen or narrow that, never silently.
- Provider requests refuse redirects and require https unless local; every write Zenith makes is
  atomic.
- Scheduled tasks and bots are chat-only, because nobody is present to approve a tool.

The full model is in
[`docs/superpowers/specs/2026-09-15-harness-threat-model.md`](docs/superpowers/specs/2026-09-15-harness-threat-model.md),
including the risks that are accepted rather than solved.

---

## Known limits

- **Undo is per reply or per file, not per hunk.** You can't keep half of an edit to one file.
- **Files written by CLI agents (Claude Code, Gemini CLI, Copilot CLI) are outside Zenith's
  control.** The audit log records the edits they report and the approvals given, not the bytes
  they wrote.
- **Windows is not yet fully verified.** CI runs the full test contract on Windows, but it doesn't
  block a push, and the app hasn't been used there day to day.
- **Stall notices cover ACP agents only.** Claude Code and the plain CLIs don't yet say why
  they've gone quiet.

See [`PRD.md`](PRD.md) for the fuller list of what's shipped, what's next, and what's deliberately
out of scope.

---

## Licence

MIT — see [`LICENSE`](LICENSE).

## Status

Zenith is developed and tested on macOS (Apple silicon). The code is cross-platform, CI runs the
full test contract on Linux, macOS and Windows on every push to `main`, and packaging targets all
three — but only Linux and macOS block the build, Windows has not been used day to day, and
packages are not signed. See [`PRD.md`](PRD.md) for what is finished and what is next.
