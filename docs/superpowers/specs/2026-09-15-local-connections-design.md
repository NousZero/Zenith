# Local Connections — Design

**Status:** Implemented 2026-09-15. Verified live against Claude Code 2.1.270 and Ollama 0.30.11; Gemini CLI (not signed in) and Copilot CLI (plan policy block) verified against their source schemas and real error output.
**Goal:** Use AI tools already installed and signed in on the computer, so no API keys are needed. API-key providers remain as an optional Advanced path.

## Principles

1. **Never read another tool's credentials.** Zenith does not copy OAuth tokens out of CLI credential files or the Keychain. Anthropic prohibits using subscription OAuth tokens in third-party apps, and reading other apps' secrets is unacceptable. Instead, Zenith runs each tool's own official headless mode, which uses that tool's own login.
2. **Read-only by construction.** CLI tools are agents. Every invocation disables tools, runs in an empty Zenith-owned working directory, and ignores user/project settings and MCP servers, so a prompt can never read or modify the user's files.
3. **Detect, explain, don't guess.** Each connection reports a concrete state and a human-readable reason (not installed / not signed in / blocked by plan / server not running).

## Connections in v1

Verified on the development machine against real output or the tools' own published type definitions.

### Claude Code (`claude`, verified 2.1.270)

- **Detect:** resolve binary; `claude auth status` prints JSON `{ "loggedIn": boolean, ... }`. Only `loggedIn` is read.
- **Run:** prompt on stdin; args `-p --output-format stream-json --verbose --include-partial-messages --tools "" --no-session-persistence --strict-mcp-config --setting-sources "" --system-prompt=<memory or neutral default> [--model=<alias>]` (the `=` forms keep a value starting with `-` from being parsed as a flag).
  - `--system-prompt` replaces the agent prompt (measured: ~6.3k → 536 prompt tokens), giving a near-raw model comparison.
  - `--setting-sources ""` keeps the user's hooks (e.g. SessionStart injectors) out of answers.
- **Stream:** `{type:"stream_event", event:{type:"content_block_delta", delta:{type:"text_delta", text}}}`.
- **Finish:** `{type:"result", is_error, result, usage:{input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens}}`.
- **Models:** `default` (omit `--model`), `sonnet`, `opus`, `haiku`.

### Gemini CLI (`gemini`, verified 0.44.1)

- **Detect:** resolve binary; signed in if `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_GENAI_USE_VERTEXAI`, or `GOOGLE_GENAI_USE_GCA` is set, or `~/.gemini/settings.json` selects an auth type, or `~/.gemini/oauth_creds.json` exists (existence only, never read).
- **Run:** prompt on stdin; args `-p " " -o stream-json --approval-mode plan --skip-trust [-m <model>]`. `-p " "` only switches to headless mode; Gemini appends it to stdin (verified).
  - `--skip-trust` is required: in an untrusted folder Gemini silently overrides `plan` back to `default`. Trusting Zenith's empty sandbox is safe.
- **Stream:** `{type:"message", role:"assistant", content, delta:true}`.
- **Finish:** `{type:"result", status:"success"|"error", error?:{type,message}, stats:{input_tokens, output_tokens}}`; `{type:"error", severity, message}`. Exit 41 = auth not configured.
- **Models:** `default`, `auto`, `pro`, `flash`, `flash-lite`, `gemini-3-pro-preview`, `gemini-3-flash-preview`.

### GitHub Copilot CLI (`copilot`, verified 1.0.80)

- **Detect:** resolve binary. Plan/policy blocks are only knowable at request time and are surfaced as errors.
- **Run:** prompt as a single argument (no shell); args `--prompt=<prompt> --output-format json --stream on --available-tools= --no-ask-user --no-custom-instructions --disable-builtin-mcps --no-color --no-auto-update [--model <id>]`.
- **Stream:** `{type:"assistant.message_delta", data:{deltaContent}}`.
- **Finish:** `{type:"assistant.usage", data:{inputTokens, outputTokens}}`, `{type:"session.error", data:{errorType, message}}`, `{type:"session.idle"}`.
- **Models:** parsed live from `copilot help config` (27 models observed), with `auto` as default.
- **Observed on dev machine:** signed in but "Access denied by policy settings" — mapped to a clear message.

### Ollama (`127.0.0.1:11434`) and LM Studio (`127.0.0.1:1234`)

- **Detect:** `GET /v1/models` with a short timeout; ready only if the body is JSON with a `data` array (a non-AI server on the same port must not be mistaken for one).
- **Run:** OpenAI-compatible `POST /v1/chat/completions` with `stream:true` and `stream_options.include_usage`.
- **Models:** from `/v1/models`.

## Process execution

- Binary resolution searches `PATH` plus common install directories (`~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.npm-global/bin`, `~/.bun/bin`, `~/.volta/bin`), because an app launched from Finder does not inherit the shell `PATH`.
- Spawned child `PATH` prepends the binary's own directory and the common directories: `gemini` and `copilot` are `#!/usr/bin/env node` scripts that fail without `node` on `PATH`.
- `spawn(absolutePath, args, { shell: false, cwd: <userData>/cli-sandbox })`; model ids validated against `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$` so they can never be read as flags.
- Abort sends `SIGTERM`, then `SIGKILL` after 3 s. stderr is captured (bounded) for error messages.

## Conversation handling

Each turn is a fresh, stateless process. Prior turns are serialized into the prompt as tagged `<user>`/`<assistant>` blocks; session memory becomes the system prompt (Claude Code) or a preamble (others). Tradeoff accepted: prompt size grows with history, in exchange for no dependence on each CLI's session storage and no pollution of the user's CLI session lists.

## Token usage

`ChatChunk` gains optional `usage { inputTokens, outputTokens }`. When an adapter reports real usage the renderer uses it; otherwise the existing estimate remains.

## UI

- **Settings → Connections:** detected tools with status and reason, plus Refresh. API keys move to an "API keys (optional)" section below.
- **Pane provider picker:** grouped "On this computer" and "API keys"; unavailable entries show why.
- **Auto-setup:** once detection completes, untouched panes (no messages, no error, provider not ready), once per session, switch to the first ready connection in priority order Claude Code → Gemini CLI → Copilot CLI → Ollama → LM Studio, with its default model selected.

## Out of scope for v1

Agent Client Protocol (`gemini --acp`, `copilot --acp`) for persistent sessions and permission denial at the protocol level; OpenCode (no `opencode` CLI on PATH on the dev machine); Hermes Agent; Windows `.cmd` shims; Copilot prompts above Linux's ~128 KB single-argument limit.
