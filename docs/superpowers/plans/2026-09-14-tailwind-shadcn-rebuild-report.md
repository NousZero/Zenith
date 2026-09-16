# Zenith Tailwind + shadcn/ui Rebuild — Implementation Report

**Date:** 2026-09-14
**Worktree:** `/Users/keshabshrestha/Documents/Zenith/.worktrees/multi-provider-harness`
**Branch:** `multi-provider-harness`
**Supersedes:** the hand-rolled custom-CSS redesign at commit `82d07dc` (`src/renderer/styles.css`), which the user rejected as "totally rookie."

## Why this rebuild

The user explicitly asked for the presentation layer to be rebuilt with Tailwind CSS and shadcn/ui-pattern components — "use templates from the web and improvise," not another bespoke design system. This report covers that rebuild only; no application logic (`useHarness.ts`, `shared/*`) changed.

## Tailwind integration: v4 via `@tailwindcss/vite`

Installed `tailwindcss@4.3.3` and `@tailwindcss/vite@4.3.3` (both pure JS — `@tailwindcss/node`'s only extra dep is `tailwindcss` itself; no `optionalDependencies` native binaries were pulled in, verified with `find node_modules/@tailwindcss -iname '*.node'` returning nothing). Confirmed it works cleanly under this repo's permanent `ignore-scripts=true` policy: `npm install` produced no missing-binary errors, and `npm run dev` / `npm run typecheck` both ran without issue. Went with v4 (the plan's preferred path) rather than falling back to v3 — no `tailwind.config.js` or PostCSS setup needed, just the Vite plugin registered in `vite.renderer.config.ts` and one `@import "tailwindcss";` at the top of the new `src/renderer/globals.css`.

Tailwind v4 does require a small addition beyond the zero-config default to get shadcn's `bg-background`/`text-foreground`/etc. utility classes working: an `@theme inline { --color-background: hsl(var(--background)); ... }` block that maps the raw HSL custom properties to Tailwind color tokens. This is the same pattern shadcn's own v4 migration guide uses, and it's the only "config" in the whole setup — everything else is `@import "tailwindcss";` plus utility classes in JSX.

## Dependencies added (all exact-pinned via `--save-exact`, all pure JS, no native compilation)

`dependencies`:
- `@radix-ui/react-select` `2.3.7`
- `class-variance-authority` `0.7.1`
- `clsx` `2.1.1`
- `tailwind-merge` `3.7.0`

`devDependencies`:
- `tailwindcss` `4.3.3`
- `@tailwindcss/vite` `4.3.3`

`node scripts/check-dependency-specs.mjs` (the project's dependency-spec gate) passes with all of these — no carets/ranges, exact stable semver as required.

## Components built

`src/renderer/lib/utils.ts` — the standard shadcn `cn()` helper (`clsx` + `tailwind-merge`).

`src/renderer/components/ui/`:
- `button.tsx` — `Button`, via `class-variance-authority`. Variants: `default` (solid, for primary actions like Send), `secondary` (bordered/transparent, for Clear/Save/+New session/+Add pane), `destructive` (bordered, turns red on hover — matches this app's existing "quiet until you mean it" pattern for Delete/Clear key), `ghost`. Sizes: `default`, `sm`, `compact` (for the tiny Retry button).
- `input.tsx`, `textarea.tsx` — standard shadcn form primitives.
- `card.tsx` — `Card`, `CardHeader`, `CardContent` (trimmed to what the pane container actually uses; skipped `CardTitle`/`CardFooter`/`CardDescription` since nothing in this app needs them).
- `badge.tsx` — `Badge`, `outline` (default/not-configured) and `success` (configured, emerald) variants. Used for the credential-configured indicator per the plan's explicit "Badge ... for credential-configured indicators" instruction.
- `select.tsx` — real Radix (`@radix-ui/react-select`) implementation: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent` (portaled, positioned via Radix's popper), `SelectItem` (with check-mark indicator). Built the full accessible/keyboard-navigable version rather than a native `<select>`, per the plan's stated preference. Trimmed `SelectGroup`/`SelectLabel`/`SelectSeparator`/scroll buttons since the two dropdowns in this app (3 static providers, a flat model list) don't need them.

Native checkboxes (pane include/memory-enabled toggles) were kept as plain `<input type="checkbox">` styled with Tailwind's `accent-foreground` utility (a native CSS `accent-color` property) rather than adding `@radix-ui/react-checkbox` — the plan didn't list Checkbox as a required primitive, and native accent-color already gives a theme-correct check color with zero extra dependency.

## Theme

`src/renderer/globals.css` sets shadcn/ui's actual default **zinc** dark-theme HSL values directly on `:root` (this app is dark-only, so there's no light-mode branch or toggle — nothing asked for one):

```
--background: 240 10% 3.9%;      --foreground: 0 0% 98%;
--card: 240 10% 3.9%;            --card-foreground: 0 0% 98%;
--popover: 240 10% 3.9%;         --popover-foreground: 0 0% 98%;
--primary: 0 0% 98%;             --primary-foreground: 240 5.9% 10%;
--secondary: 240 3.7% 15.9%;     --secondary-foreground: 0 0% 98%;
--muted: 240 3.7% 15.9%;         --muted-foreground: 240 5% 64.9%;
--accent: 240 3.7% 15.9%;        --accent-foreground: 0 0% 98%;
--destructive: 0 62.8% 30.6%;    --destructive-foreground: 0 0% 98%;
--border: 240 3.7% 15.9%;        --input: 240 3.7% 15.9%;
--ring: 240 4.9% 83.9%;          --radius: 0.5rem;
```

Per-provider accents layered on top, chosen to read well against zinc:
- `--provider-openai: 168 76% 42%` — teal
- `--provider-anthropic: 14 65% 55%` — warm terracotta (close to Anthropic's own clay brand tone)
- `--provider-openrouter: 262 60% 65%` — violet

Each pane's left border (`border-l-4`) is set to its provider's accent via one inline `style={{ borderLeftColor }}` (the one legitimately dynamic style value, same pattern the prior implementation used and confirmed compatible with this app's CSP), and the assistant-message role label picks up the same color.

## Files changed

- `vite.renderer.config.ts` — added `@tailwindcss/vite` to the plugins array.
- `src/renderer/main.tsx` — now imports `./globals.css` instead of the deleted `./styles.css`.
- `src/renderer/styles.css` — deleted (624 lines of hand-rolled CSS custom properties/component classes).
- `src/renderer/globals.css` — new Tailwind entry point (theme tokens above).
- `src/renderer/lib/utils.ts`, `src/renderer/components/ui/{button,input,textarea,card,badge,select}.tsx` — new.
- `App.tsx`, `Pane.tsx`, `PromptBar.tsx`, `SessionSidebar.tsx`, `MemoryPanel.tsx`, `CredentialSettings.tsx` — rewritten to Tailwind utility classes + the new `ui/*` primitives. No logic changes — every prop, handler, and piece of state passed in from `useHarness.ts` is wired exactly as before. Verified by inspection that every existing feature is still present: pane add/remove, provider/model selection (now Radix `Select`), credential save/clear with configured/not-configured states (now a `Badge`), shared prompt fan-out, per-pane reply, Clear/Copy response/Delete, native `resize-x` pane resize, session create/switch/delete, memory panel, and the `pane.lastError` + Retry row.

## `npm run verify` — full output (clean)

```
> zenith@0.0.0-private preflight:deps
{"status":"passed","directDependencyCount":35,"lifecycleScripts":"disabled"}

> zenith@0.0.0-private format:check
Checking formatting...
All matched files use Prettier code style!

> zenith@0.0.0-private lint
(no output — 0 errors, 0 warnings)

> zenith@0.0.0-private typecheck
(no output — clean under full strict mode: exactOptionalPropertyTypes,
noUncheckedIndexedAccess, noPropertyAccessFromIndexSignature, verbatimModuleSyntax)

> zenith@0.0.0-private test:unit
 Test Files  7 passed (7)
      Tests  16 passed (16)

> zenith@0.0.0-private test:integration
 Test Files  2 passed (2)
      Tests  8 passed (8)

> zenith@0.0.0-private test:component
No test files found, exiting with code 0
```

One real fix needed along the way: `tsc` initially rejected `<Select value={pane.modelId || undefined} .../>` under `exactOptionalPropertyTypes: true` (Radix's `value?: string` doesn't accept an explicit `undefined`). Fixed by conditionally spreading the prop instead: `{...(pane.modelId ? { value: pane.modelId } : {})}`. One lint fix: `select.tsx`'s `export const Select = SelectPrimitive.Root` / `SelectValue` re-exports aren't recognized as "components" by `react-refresh/only-export-components`, which fires as a warning and this repo's `--max-warnings 0` treats warnings as failures — added a single file-level `eslint-disable` comment with justification, which is the standard fix for this exact, well-known false positive on re-exported Radix primitives.

## Visual verification

Launched via the prescribed direct-launch recipe (`npm run dev`, direct-PID `osascript`/`screencapture`, Electron CDP attach being blocked by the packaged-build fuse). First attempt hit a stale Electron process left over from earlier work squatting on port 5173 (PID tree rooted at 71140, started ~6.5 hours earlier in this same worktree) — killed it, confirmed it had not written any new session file beyond the 7 already present, then relaunched cleanly.

Screenshot (`/tmp/zenith-tailwind-screenshot3.png`, window resized to 1400×900 for legibility) shows:

- **Zinc dark theme is unmistakably active**: near-black (`#0a0a0a`-ish) background throughout, no unstyled/black-on-white browser defaults anywhere — Tailwind is loading and applying correctly.
- **Session sidebar** (left): bordered "+ New session" button styled as a real secondary button (subtle border, muted text, no browser-default button chrome); session list with the active session visibly highlighted with a lighter background.
- **Credential bar**: three provider rows, each with an "outline" variant `Badge` reading "Not configured" (thin border, muted gray text — correct default-state styling), the provider name, a properly-styled `Input` for the API key (dark, bordered, rounded, focus-ring-ready), and a `Button` "Save" in the secondary bordered style.
- **Memory panel**: uppercase muted-gray caption label, a bordered `Textarea` with a visible native resize handle in the corner.
- **Prompt bar**: full-width `Input` with placeholder text, a `Button` "Send" (visibly in its disabled/dimmed state since the prompt was empty — correct `disabled` styling), and a monospace tabular-nums token counter.
- **Pane card**: rendered as a proper `Card` — rounded corners, subtle border, and critically, a clearly visible **teal left border accent** (4px, `border-l-4`) confirming the per-provider accent-color system is wired and rendering (this pane's provider was `openai`, whose accent is the teal `168 76% 42%`). Header row shows the checkbox (checked, white checkmark rendering correctly against the dark fill), an editable pane-name field, and `Clear` / `Copy response` (correctly disabled/dimmed, since no assistant message exists yet) / `Delete` buttons all in consistent button styling.
- **Provider/model selects**: both rendered as proper bordered dropdown triggers with a chevron icon on the right — the real Radix `Select` component, not a native `<select>` — `openai` selected, `Select model…` showing as placeholder text in muted gray for the still-empty model field.
- **"Use session memory" checkbox**, message list area (empty, dark, bordered, with the teal accent bleeding through on the left edge), the reply row (`Input` + `Send` button, both correctly dimmed/disabled with no reply text yet), and the amber "Add an API key for openai to send." helper text below it — all present and styled consistently with the rest of the theme.

This is a genuinely recognizable, professional dark shadcn/ui-style interface — bordered cards, consistent button/input treatment, a real accessible Select, badges, and the zinc palette — not another bespoke design system.

An unrelated crash dialog ("MainKt quit unexpectedly") appeared mid-session from a different, unrelated application on the machine and was dismissed; it has nothing to do with Zenith or this change.

Cleanup: killed the Electron process (PID 18580) after the screenshot. The test launch (across both the killed stale process and this run) produced two new empty session files in `~/Library/Application Support/zenith/sessions/` (a known pre-existing, unrelated bug — every launch writes a fresh session); both were deleted, restoring the directory to its original 7 files.

## Scope notes / what was deliberately not done

- No light theme / theme toggle — this app is dark-only and nothing requested one.
- No `@radix-ui/react-checkbox` — native checkboxes with `accent-color` cover the two toggles in this app; Checkbox wasn't in the plan's required-primitives list.
- `CardTitle`/`CardDescription`/`CardFooter`, `SelectGroup`/`SelectLabel`/`SelectSeparator`, Radix Select's scroll-up/down buttons — real shadcn/Radix subcomponents that exist in the upstream templates but aren't exercised by anything in this app, so they weren't hand-authored.
