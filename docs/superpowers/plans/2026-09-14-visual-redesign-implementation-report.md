# Zenith Visual Redesign — Implementation Report

**Date:** 2026-09-14
**Commit:** `82d07dc` on branch `multi-provider-harness`
**Worktree:** `/Users/keshabshrestha/Documents/Zenith/.worktrees/multi-provider-harness`

## What was built

### 1. Stylesheet foundation

`src/renderer/styles.css` (new file) implements the design spec verbatim:

- **Color system** — every token from §1 (surfaces, text, borders, accent, semantic, per-provider) as CSS custom properties on `:root`, copied at exact hex/rgba values from the spec.
- **Typography** — the full type scale from §2.2 (`--text-2xs-size` through `--text-mono-lh`, weights), font stacks, and a `.caption-label` utility class for the small-uppercase-label pattern (`letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted)`).
- **Spacing scale** — `--space-1` through `--space-10`, `--radius-sm/md/lg` from §3.
- **Every component treatment in §4**: `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-destructive` (+ `.btn-compact`, `.btn-retry` size variants), `.input`/`.textarea`/`.memory-textarea`, `.select` (with the hand-authored inline-SVG chevron background-image from the spec, byte-for-byte), `.pane-card` (including the `::-webkit-resizer` paint-over and the hand-drawn radial-gradient 3-dot resize affordance from §4.4), `.checkbox` custom checkbox styling, `.message-row`/`.message-role`/`.message-content` (+ `role-user`/`role-assistant`/`role-error` variants), `.session-item`/`.session-item-button` sidebar treatment, `.credential-bar`/`.cred-row`/`.cred-status-dot`, `.token-count`.
- A minimal `html, body, #root { height: 100%; margin: 0; }` + `body { background: var(--bg-base); ... }` reset, needed because the app previously relied entirely on inline styles with no reset — without it the browser's default 8px body margin would show through the new full-bleed dark shell.

Imported once via `import "./styles.css";` in `src/renderer/main.tsx` (Vite's standard CSS-import handling; confirmed this works in both dev — `style-src 'self' 'unsafe-inline'` — and production — `style-src 'self'`, where Vite extracts a real `.css` file — against the existing CSP setup in `vite.renderer.config.ts`, so `index.html` needed no changes).

### 2. Component restyle

`App.tsx`, `Pane.tsx`, `PromptBar.tsx`, `SessionSidebar.tsx`, `MemoryPanel.tsx`, `CredentialSettings.tsx` — every inline `style={{...}}` object was removed and replaced with class names from the new stylesheet. The only remaining inline style is the one the spec explicitly calls out as necessarily dynamic: each pane's `--provider-color` custom property, set per-render from `pane.providerId` via a small `PROVIDER_COLOR_VAR` lookup map in `Pane.tsx`. No other dynamic/stateful style values exist in this codebase (checked — pane width is native CSS `resize: horizontal`, not React state), so nothing else needed to stay inline.

Per §4.5, assistant message rows now render the pane's provider id as the role label (e.g. "OPENAI") instead of the literal word "assistant", colored via `--provider-color`; user rows render "YOU" in muted gray — both via the CSS `text-transform: uppercase` on `.message-role`, so the JSX only needs to emit lowercase text.

### 3. Failed-send UI state (§5.2 of the spec)

- `src/shared/types.ts`: `PaneState` gained `lastError: string | null`.
- `src/renderer/useHarness.ts`:
  - `createPane` defaults `lastError: null`.
  - `sendToPane` now clears `lastError: null` in the same `updatePane` call that appends the outgoing user message (i.e. at the start of every send attempt, not only on success — see deviation note below), and on failure formats a friendly message: `"No API key configured for {provider}."` when the underlying error message contains `"No credential configured"` (this exact string is thrown by `src/main/ipc.ts`'s `requireCredential`), else `"Request failed: {message}"`.
  - A new `lastPromptRef` (a `Map<paneId, string>`) records each pane's last attempted prompt text, and a new `retrySend(paneId)` re-invokes `sendToPane` with it. Both are internal to the hook; `retrySend` is exported alongside the existing returned functions.
- `src/renderer/Pane.tsx`:
  - Renders an error row (`.message-row.role-error`) at the end of the message list when `pane.lastError` is set, with role label "ERROR" and a `.btn-retry`-sized "Retry" button wired to a new `onRetry` prop.
  - Proactively disables the pane's own reply-row Send button (and guards the Enter-key handler) when `configuredProviders` (lifted from `App.tsx`, see below) doesn't include `pane.providerId`, showing `.cred-helper` text: `"Add an API key for {provider} to send."` per the spec's "prevent, don't just report" directive.
- `src/renderer/App.tsx`: lifts a `configuredProviders` state, fetched via `window.zenith.credentials.list()` on mount and whenever `credentialsVersion` changes (the same signal `CredentialSettings` already fires after save/clear), and passes it down to each `Pane` along with a new `onRetry` prop wired to `retrySend`.
- `tests/unit/fan-out.test.ts`: `makePane`'s literal now includes `lastError: null` so it still satisfies the `PaneState` type — no test *behavior* changed since `buildFanOutMessages` doesn't touch `lastError`.

### 4. Icons

No npm dependency added. The only two SVG/CSS-only affordances from §6 — the select chevron (inline `data:image/svg+xml` background-image) and the pane resize-grip (a pure CSS `radial-gradient` dot pattern) — were hand-authored exactly as specified, verbatim from the spec's CSS. The session-delete `×` glyph was kept as-is per the spec's explicit instruction not to replace it.

## Deviations from the spec (and why)

1. **`lastError` clearing timing.** The spec says lastError is "cleared on the next successful send or on dismiss." I clear it at the *start* of every new send attempt (success or not) rather than waiting for success, and I did not add a separate dismiss control beyond the Retry button. Rationale: the spec's visual treatment paragraph only specifies a Retry action, not a dismiss button; clearing eagerly on retry/resend avoids a stale error banner sitting next to a new in-flight attempt, which is the more correct UX and required no extra UI element. Smallest reasonable interpretation of an otherwise-unspecified visual for "dismiss."
2. **No "SESSIONS" sidebar caption.** §2.2's token-scale table cites "SESSIONS" as an example use of the `--text-xs` uppercase-label pattern, but the sidebar's existing structure (per the "no layout/feature restructuring" scope note at the top of the spec) has no such heading today. I treated this as an illustrative example of where the token pattern is used elsewhere (the memory panel caption, which does exist and does get the treatment), not a mandate to add new sidebar content, and left the sidebar's existing elements alone rather than introducing new text not present in the original component.
3. **No "Configured" caption text in the credential bar.** §4.7 says a small "Configured" caption "may sit under/after the label" for the configured state — explicitly optional, and the same section says the dot alone is "the fastest scan signal... no need to color the whole row." I implemented only the dot state change (muted → `--color-success`), skipping the optional caption to keep the diff minimal.
4. **Primary-button empty-state disabling extended to `PromptBar`'s fan-out Send.** The spec's §4.1 button treatment lists "Disabled (empty prompt)" as standard for primary buttons generically (not scoped only to the pane reply Send), so I added `disabled={!prompt.trim()}` to `PromptBar`'s Send button too, matching the pane-level Send. This is a strict behavioral no-op (the same guard already existed inside the click handler), just now also surfaced as a real disabled state, consistent with the spec's canonical states list in §5.1.

## `npm run verify` output

Ran twice (once before, once after an unrelated environment hiccup described below); both clean:

```
> zenith@0.0.0-private verify
> npm run preflight:deps && npm run format:check && npm run lint && npm run typecheck && npm run test

{"status":"passed","directDependencyCount":29,"lifecycleScripts":"disabled"}
Checking formatting...
All matched files use Prettier code style!
(eslint: no output, exit 0)
(tsc --noEmit + tsc --build: no output, exit 0)

Test Files  7 passed (7)   Tests  16 passed (16)   [unit]
Test Files  2 passed (2)   Tests  8 passed (8)     [integration]
No test files found, exiting with code 0            [component — pre-existing, no renderer UI tests in this repo]
```

## Visual confirmation

Ran the app for real rather than only typechecking it. `npm run dev` (`electron-forge start`) launches through `electron-forge`'s own orchestration, which isn't easily attachable to Playwright for scripted screenshots, so I instead: started the renderer's Vite dev server directly on the port the Forge-built `main.cjs` already expects (`localhost:5173`, confirmed by grepping the built main bundle), then used Playwright's `_electron.launch()` against the project's own `node_modules/electron` binary (with `ELECTRON_RUN_AS_NODE` — set globally in this shell's environment — unset for the launch, since Electron treats that variable as "run as plain Node," which was the initial launch failure). This produced a fully live, real window I could screenshot and click through like a user, then closed.

Observed, across 5 screenshots:

- **Overall shell**: full-bleed dark (`--bg-base` `#0e0f13`) background edge-to-edge, no more default body margin/flash. Sidebar, credential bar, memory panel, and prompt bar all render as visibly *raised* (`#15171c`) relative to the shell, giving the three-step elevation the spec calls for.
- **Session sidebar**: "+ New session" and four "New session" rows rendered with the restyled `.session-item-button` treatment (hover/active states implemented and present in CSS; not separately screenshotted mid-hover, but visually confirmed the borderless/transparent-at-rest look matches).
- **Credential bar**: three provider rows (openai/anthropic/openrouter), each with a small muted-gray status dot (not-configured, correctly neutral not red), provider label, password-type API-key input styled via `.input.cred-input`, and a "Save" button correctly rendered in the disabled/dimmed state (opacity ~0.45) since the draft field is empty — confirms `.btn:disabled` and the "disabled until non-empty" logic both work.
- **Memory panel**: uppercase muted caption "MEMORY (PREPENDED TO ANY PANE WITH ITS MEMORY TOGGLE ON)" rendering with the letter-spaced uppercase treatment, sunken textarea below it.
- **Two pane cards side by side**: each with a 2px colored left border — pane 1 showed the teal-green `--provider-openai` border while set to "openai", and after switching its provider selector to "anthropic" (via a real `<select>` interaction) the border color changed live to the terracotta `--provider-anthropic` — confirming the CSS custom property wiring is per-pane and reactive. Restyled checkbox, borderless pane-name field, secondary-styled Clear/Copy-response buttons (Copy response correctly dimmed/disabled with no assistant reply yet), destructive-styled Delete button, restyled provider/model `<select>` elements with the hand-drawn chevron visible, sunken message-list well, reply row with primary blue Send button, and the small dot-pattern resize-grip affordance visible in the card's bottom-right corner (subtle at rest, as the spec intends) were all visually present and matched the direction — dark, IDE-adjacent, not a consumer chat bubble UI.
- **Failed-send state**: this required working around an architectural point the task's verification note undersells — with *zero* credentials configured for *any* provider, a pane's model `<select>` cannot ever be populated for openai/openrouter (their `listModels()` calls make a real, credential-required network request), so `sendToPane`'s pre-existing `if (!pane.modelId) return;` guard means no send is ever attempted for those two providers in a truly fresh install — not even the old silent-`console.error` bug reproduces there, because the function returns before the network call. Anthropic's `listModels()`, however, is a static hardcoded list with no credential requirement, so I switched pane 1 to "anthropic," selected "Claude Opus 5" from the now-populated dropdown (all through real DOM `<select>` interaction, zero credentials configured anywhere), then used the top `PromptBar`'s fan-out Send (which, per the spec's stated scope, is not credential-gated — only the pane's own reply Send is) to actually invoke `chat.send`. Result, confirmed both by DOM text extraction and by screenshot:
  - The pane's own reply-row Send button was independently confirmed `disabled` (Playwright's `isDisabled()`) with helper text `"Add an API key for anthropic to send."` visible in warning-orange beneath it — the proactive-disable path works correctly on its own, before any send was even attempted.
  - After the fan-out send failed, an error row appeared inside pane 1's message list: red-tinted background, red border, uppercase red "ERROR" label, body text reading exactly `"No API key configured for anthropic."` (confirming the main process's `"No credential configured for anthropic."` was correctly translated to the spec's exact wording), and a "Retry" button in the smaller `.btn-retry` sizing — all inside the pane, not just the console.
- Screenshots were reviewed directly (not just asserted by selector text) to confirm color, spacing, and typography visually match the spec's direction, not only that the right classes were present in the DOM.

The app was closed via Playwright's `app.close()` at the end of the driver script; the dev Vite server process was also stopped afterward. No temp driver script or dev artifacts were committed (`.vite/` is already gitignored; the scratch Playwright driver script used for screenshotting lived only in the scratchpad / was deleted from the project directory before committing).

## Unrelated environment note (not a code issue)

Partway through verification, `git status` in this worktree started failing with `fatal: ... index: unable to map index file: Operation timed out`. Diagnosis: the worktree's `.git/worktrees/multi-provider-harness/index` file had been evicted to iCloud ("Desktop & Documents" sync marks it `dataless`) apparently under local disk-space pressure (9.8GB free), and the sandbox couldn't force a re-download. Fixed by moving the dataless index file aside and running `git read-tree HEAD` (which rebuilds the index from the last commit without touching any working-tree file) — confirmed afterward that `git status`/`git diff --stat` showed exactly the intended change set with nothing lost or altered. Flagging this since it's a host/iCloud-sync condition that could recur on this machine, unrelated to the redesign work itself.

## Files touched

- `src/renderer/styles.css` (new)
- `src/renderer/main.tsx`
- `src/renderer/App.tsx`
- `src/renderer/Pane.tsx`
- `src/renderer/PromptBar.tsx`
- `src/renderer/SessionSidebar.tsx`
- `src/renderer/MemoryPanel.tsx`
- `src/renderer/CredentialSettings.tsx`
- `src/renderer/useHarness.ts`
- `src/shared/types.ts`
- `tests/unit/fan-out.test.ts`
- `docs/superpowers/specs/2026-09-14-visual-redesign.md` (the spec itself, now committed)
