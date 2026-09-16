# Working in this repository

Zenith is an Electron desktop app that runs several AI coding tools in one window. This file is
the guide for anyone — person or agent — making changes here.

## Read first

1. [`README.md`](README.md) — what the app does and how to run it.
2. [`PRD.md`](PRD.md) — what it is for, what is in scope, what is deliberately not.
3. [`docs/superpowers/specs/2026-09-15-harness-features-roadmap.md`](docs/superpowers/specs/2026-09-15-harness-features-roadmap.md)
   — the phase-by-phase record of how each feature works and how it was checked.
4. [`docs/superpowers/specs/2026-09-15-harness-threat-model.md`](docs/superpowers/specs/2026-09-15-harness-threat-model.md)
   — trust boundaries, controls and accepted risks. Read before touching approvals, tools,
   credentials, bots or the preview scheme.

`SPEC.md`, `PLAN.md`, `docs/PROJECT-STATUS-AND-ROADMAP.md`, `docs/decisions/`, `docs/operations/`
and `tasks/` describe the earlier Windows-only workbench, replaced in September 2026. Treat them
as history; don't plan from them.

## Stack

- Electron 43 with Node 24, built by Electron Forge with the Vite plugin.
- TypeScript in strict mode (`exactOptionalPropertyTypes` included), React 19, Tailwind v4 and
  Radix primitives in the window.
- `node:sqlite` for local state, with numbered migrations in `src/main/database.ts`.
- `node-pty` and xterm.js for the terminal — the only native module.

## Layout

| Path                | What lives there                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `src/main`          | Everything with authority: connections, agent loops, tools, Git, terminal, bots, scheduler, IPC |
| `src/preload`       | The typed bridge; every call is listed in `ZenithApi` in `src/shared/types.ts`                  |
| `src/renderer`      | The interface; no Node access, no direct file or network use                                    |
| `src/shared`        | Types and pure logic both sides import                                                          |
| `tests/unit`        | Fast tests for pure logic                                                                       |
| `tests/integration` | Real processes, files, servers and databases, with fakes in `tests/fixtures`                    |

## Commands

```bash
npm run verify        # formatting, lint, types, unit and integration tests — run before every commit
npm run dev           # start the app in development
npm run package       # build the app for this platform
npm rebuild node-pty --ignore-scripts=false   # after a fresh install, for the terminal
```

`npm run verify` must pass with no warnings; lint runs with `--max-warnings 0`.

## House rules

- **Smallest change that solves the problem.** No speculative abstractions, no configuration for
  values that never change.
- **Match the surrounding code**, including comment density and naming.
- **Comments explain why**, not what. Write them for the next person reading the file cold.
- **User-facing text is plain language**: say what happens and what it costs. No jargon where a
  short sentence does.
- **Every behavior change gets a test**, in the suite that can actually catch it. Integration
  tests use real processes and files; fakes live in `tests/fixtures`.
- **Format only the files you changed** (`npx prettier --write <paths>`), never the whole tree.

## Security rules that are not negotiable

- The main process keeps all authority. The window asks; it never reaches the file system,
  network or child processes directly.
- Agents ask before edits, commands and MCP tools. Anything that resolves outside the project
  folder — including through a symbolic link — always asks, whatever the rules say.
- Never read another tool's credentials or sign-in tokens. Keys go to the encrypted credential
  store and are never sent back to the window.
- Remote input (bots, scheduled runs) may never run a tool.
- Preview and workspace paths are confined with real-path checks; the preview scheme serves only
  folders the window has open and allows no network.

## Finishing a change

1. `npm run verify` passes.
2. Check the behavior in the packaged app when it touches the interface or a process.
3. Add a short section to the roadmap document saying what changed and how it was verified.
4. Commit with a message that says what the user gets. Don't push or merge without being asked.
