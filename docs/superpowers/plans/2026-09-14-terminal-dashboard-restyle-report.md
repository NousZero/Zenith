# Zenith Terminal-Dashboard Restyle — Report

**Date:** 2026-09-14
**Branch:** `multi-provider-harness`
**Base commit:** `a9cb57b` (Tailwind + shadcn/ui rebuild)
**Worktree:** `/Users/keshabshrestha/Documents/Zenith/.worktrees/multi-provider-harness`

## Goal

Re-skin Zenith's existing Tailwind v4 + shadcn/ui (Radix Select, cva button variants) implementation to match the visual language of an unrelated reference screenshot (`tasks/evidence/artifacts/latest-phase-preview.png`, a dev-workbench tool): near-black background, monospace typography, hairline borders, sparing amber accent, info-strip metadata cells, and a bordered inspector/top-bar shape. No component behavior, structure, or Zenith-specific content changed — this was styling only.

## Theme values changed (`src/renderer/globals.css`)

All CSS custom property **names** were kept identical; only their HSL values changed, so no Tailwind class in any component had to change to pick up the new theme (only radius/rounding classes were edited separately, see below).

| Token | Before (shadcn zinc) | After (near-black/amber) |
|---|---|---|
| `--background` | `240 10% 3.9%` | `0 0% 4%` |
| `--foreground` | `0 0% 98%` | `0 0% 95%` |
| `--card` | `240 10% 3.9%` | `0 0% 5%` |
| `--card-foreground` | `0 0% 98%` | `0 0% 95%` |
| `--popover` | `240 10% 3.9%` | `0 0% 6%` |
| `--popover-foreground` | `0 0% 98%` | `0 0% 95%` |
| `--primary` | `0 0% 98%` (white) | `38 92% 50%` (amber/gold) |
| `--primary-foreground` | `240 5.9% 10%` | `0 0% 9%` |
| `--secondary` | `240 3.7% 15.9%` | `0 0% 10%` |
| `--secondary-foreground` | `0 0% 98%` | `0 0% 88%` |
| `--muted` | `240 3.7% 15.9%` | `0 0% 10%` |
| `--muted-foreground` | `240 5% 64.9%` | `0 0% 56%` |
| `--accent` | `240 3.7% 15.9%` | `0 0% 13%` |
| `--accent-foreground` | `0 0% 98%` | `0 0% 95%` |
| `--destructive` | `0 62.8% 30.6%` | `0 70% 50%` |
| `--destructive-foreground` | `0 0% 98%` | `0 0% 98%` (unchanged) |
| `--border` | `240 3.7% 15.9%` | `0 0% 17%` |
| `--input` | `240 3.7% 15.9%` | `0 0% 17%` |
| `--ring` | `240 4.9% 83.9%` (light gray) | `38 92% 50%` (amber, matches `--primary`) |
| `--radius` | `0.5rem` | `0.25rem` (so `--radius-sm` resolves to `0px` — sharp corners) |

Per-provider accent hues (`--provider-openai/anthropic/openrouter`) were left untouched — they're not part of the shadcn theme system the task asked to re-skin, and they still read fine as accent borders/labels against the new near-black background.

**Font:** added `--font-sans: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;` inside the `@theme inline` block. Tailwind v4's Preflight resolves `html`'s default `font-family` from `--font-sans` (via `--default-font-family`), so this makes monospace the actual default UI font everywhere, not just a `font-mono` utility class for code.

**Grid texture:** added a `.grid-texture` class (plain CSS, outside Tailwind's utility system so it's never purged) using a low-opacity (`0.035` foreground-alpha) `repeating-linear-gradient` with 48px vertical bands, applied to the app's root `<div>` in `App.tsx`. Confirmed visually (see below) — subtle at normal viewing size, clearly present on close zoom.

## Sharper corners / hairline borders (component files)

Changed `rounded-md`/`rounded-lg`/`rounded-full` → `rounded-sm` (which now resolves to `0px` given the new `--radius`) in: `button.tsx`, `card.tsx`, `input.tsx`, `select.tsx` (trigger + content), `badge.tsx`, and the ad-hoc `rounded-md` borders inside `Pane.tsx` (message list container, error box).

`button.tsx`'s `default` variant was changed from a solid `bg-primary` fill to a bordered/muted style (`border border-border bg-secondary/40 text-foreground hover:border-primary/60 hover:bg-accent hover:text-primary`), matching the reference's "muted default state, brightening on hover — not a filled-primary block" button look, and keeping amber usage sparing (only as a hover-state tint and the focus ring, not a base fill). Button text became `uppercase tracking-wide text-xs`/`text-[10px]` across all sizes, matching the reference's small-caps button labels.

`badge.tsx` became `uppercase tracking-wide text-[10px]` with `rounded-sm` instead of `rounded-full`, matching the reference's bordered status-pill look.

## Info-strip / inspector-panel pattern — where applied

1. **`src/renderer/Pane.tsx`** — the reference's "TARGET / CONTENT IDENTITY / RISK / RECOVERY" row inspired a new 3-cell info-strip (`grid grid-cols-3 gap-px border border-border bg-border`, using the CSS grid-gap-as-hairline-divider trick so no extra divider markup was needed) showing **Provider / Model / Tokens** per pane, each cell an uppercase 10px micro-label over a bold value. This *replaces* the old plain-text line `"{total} tokens (P prompt / C completion)"` — the same prompt/completion breakdown is preserved as a small muted second line under the Tokens value (`{prompt}p / {completion}c`), so no information was lost, only re-presented as bordered cells.
2. **`src/renderer/CredentialSettings.tsx`** — restyled into a titled "CREDENTIAL VAULT" section containing one bordered row per provider, label-left (`OPENAI` + configured/not-configured badge) / value-right (either the "Clear key" button, or the API-key input + Save button) — matching the reference's "Soul / Default · locked" nested bordered-row layout. All existing save/clear/list logic and handlers are untouched.

## Top bar (`App.tsx`)

Zenith previously had no distinct top bar — `CredentialSettings` sat directly at the top of the main column. Added a new top-level bar (icon-mark square with bold "Z" in amber + border, bold uppercase "ZENITH" name, muted uppercase subtitle "Multi-provider chat harness", and two right-aligned bordered/dot-prefixed status pills showing real state: configured-provider count and pane count for the active session). This required restructuring the top-level layout from a single flex-row (`sidebar | main-column`) into a flex-column (`top-bar` then `flex-row(sidebar | main-column)`) — purely structural/presentational, no behavior changed.

## Left rail (session sidebar)

Applied the reference's left-nav pattern to `SessionSidebar.tsx`: each session item now shows a small bordered two-digit ordinal box (`01`, `02`, …, based on list position) next to the session name, with the active item getting a left amber accent bar (`border-l-primary`) plus a lighter background, replacing the previous plain rounded-button list-item look. Select/delete behavior is unchanged.

## What was deliberately NOT changed

- No new Zenith concepts, tabs, or panels invented to mirror the reference's terminal/git/approvals/manifest features (Zenith doesn't have those).
- No content strings like "AGAMEMNON" or "G2 OFFLINE LOOP" copied — all labels are Zenith's real data (provider ids, model labels, token counts, session names, pane names).
- Per-provider hue accents, message-list logic, pane resize/add/remove, credential save/clear, fan-out send, per-pane reply, error/Retry row, and session create/switch/delete were not touched beyond wrapping their existing DOM in new border/spacing classes.

## `npm run verify` output

Ran (after `npx prettier --write src/renderer/Pane.tsx` to fix one formatting warning from the initial pass):

```
> zenith@0.0.0-private verify
> npm run preflight:deps && npm run format:check && npm run lint && npm run typecheck && npm run test

preflight:deps  → {"status":"passed","directDependencyCount":35,"lifecycleScripts":"disabled"}
format:check    → All matched files use Prettier code style!
lint            → eslint . --max-warnings 0 --flag unstable_native_nodejs_ts_config  (clean, no output)
typecheck       → tsc --noEmit (both tsconfig.json and tsconfig.processes.json)      (clean, no output)
test:unit       → Test Files 7 passed (7) | Tests 16 passed (16)
test:integration→ Test Files 2 passed (2) | Tests 8 passed (8)
test:component  → No test files found, exiting with code 0
```

Fully clean — no warnings, no failing tests.

## Visual verification

Launched via `npm run dev` (electron-forge), Electron PID 93301, window bounds `320,140,1280,832` (macOS Accessibility permission was available in this environment, so the exact-bounds AppleScript path worked — no fallback to full-screen capture was needed). Captured a cropped screenshot (`/tmp/zenith-restyle-screenshot.png`) and read it back for comparison against the reference image.

**Honest comparison against `latest-phase-preview.png`:**

- **Background**: Confirmed near-black (not shadcn's blue-tinted zinc) — matches the reference's flat near-black tone.
- **Grid texture**: Not visually distracting at normal viewing size (as intended — "a texture, not a visible grid"). Zoomed into an empty region (200×200px crop scaled 2×) and confirmed the vertical hairlines are genuinely rendering at low opacity, not just present in CSS source but inert. This matches how subtle the texture is in the reference image itself.
- **Typography**: Monospace is visibly the font everywhere — labels, session names, button text, pane content, top-bar name/subtitle. Matches the reference's consistent monospace look.
- **Micro-labels**: "CREDENTIAL VAULT", "MEMORY (…)", "PROVIDER"/"MODEL"/"TOKENS", the top-bar subtitle, and message role labels ("you"/"openai") all render as small uppercase, wide-tracked, muted-gray text sitting above larger content — directly matching the reference's "WORKSPACE"/"ACCESS TRUST" label style.
- **Borders**: Thin, low-contrast hairline borders delineate the top bar, credential rows, pane cards, the info-strip cells, and session list items — sharp corners throughout (no rounded-lg cards remain). Matches the reference's flat bordered-card aesthetic.
- **Amber accent**: Used sparingly and exactly where the reference uses it — the top-bar icon-mark square + "Z", the checked state of both checkboxes (fan-out include / use-memory), the active session's left accent bar, and button hover/focus rings. The overall palette reads as monochrome gray/white with amber highlights, not an amber-heavy UI — matches the "used sparingly" instruction.
- **Info-strip pattern**: The Provider/Model/Tokens row in each pane visually reads as the same "uppercase label over bold value, in a row of bordered cells" pattern as the reference's TARGET/CONTENT IDENTITY/RISK/RECOVERY row, confirmed in the screenshot.
- **Inspector/label-left-value-right pattern**: The Credential Vault section's per-provider rows (label + badge on the left, action/input on the right, inside a bordered row) read the same way as the reference's Soul/Role nested rows.
- **Top bar and left rail**: Both new shapes (icon-mark+name+subtitle+pills; numbered bordered session items with active accent bar) are visually present and match the reference's silhouette, adapted to Zenith's real data (provider/pane counts, session names) rather than inventing fake content.

No visual regressions were spotted — all six components (top bar/App shell, session sidebar, credential settings, memory panel, prompt bar, pane) rendered without errors; the only console errors in the dev log were the pre-existing, expected "No credential configured for openai" messages from providers with no API key set (unrelated to this styling change).

**Session cleanup**: `ls "$HOME/Library/Application Support/zenith/sessions/"` showed 7 pre-existing session files before the test launch. The launch created 2 new empty session files (`e194dc32-…json`, `f505e26c-…json` — likely one per React root mount/remount under Vite HMR + StrictMode); both were deleted after the screenshot was taken, restoring the directory to its original 7 pre-existing entries. No other session files were touched.

## Commit

All changes above were committed in a single commit once `npm run verify` passed and the screenshot comparison was completed.
