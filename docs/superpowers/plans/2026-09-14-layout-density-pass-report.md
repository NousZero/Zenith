# Layout & Density Pass — Report

Branch: `multi-provider-harness`
Starting HEAD: `3535292`

## Goal

The theme (near-black/monospace/amber) landed correctly in the previous pass, but
the layout was top-heavy stacked blocks instead of the reference's dense
three-column dashboard. This pass is layout/density/proportion only — no
handler, prop, or `useHarness.ts` logic changed.

## Reference vs. before

- Reference: narrow left rail | wide center column | ~280px right inspector
  (SESSION-style card + Credential vault), dense rows, amber reserved for one
  prominent heading + accents.
- Before: Credential vault as a giant full-width top block, Memory panel as
  another full-width block, a single 340px pane floating in a huge empty void,
  loose spacing, model `<select>` text wrapping to two lines, pane header
  buttons wrapping to a second row, vertical-only faint grid texture, and the
  "N providers" pill always showing a green dot even at 0 configured.

## Changes made

- `src/renderer/globals.css`: `html { font-size: 87.5%; }` to uniformly tighten
  all rem-based Tailwind spacing/typography in one lever; `.grid-texture` now
  layers a horizontal `repeating-linear-gradient` alongside the existing
  vertical one (true two-axis graph paper) at lower opacity (0.035 → 0.02).
- `src/renderer/components/ui/select.tsx`: wrapped `SelectTrigger`'s children
  in a `truncate whitespace-nowrap` span and added `min-w-0` to the trigger so
  the model select's placeholder/value can never wrap to a second line;
  trigger height/text also tightened (h-9→h-8, text-sm→text-xs).
- `src/renderer/components/ui/card.tsx`: `CardHeader`/`CardContent` default
  padding and gaps reduced (only consumer is `Pane.tsx`, verified via grep).
- `src/renderer/Pane.tsx`: Card is now `flex-1 basis-0 min-w-[320px]
  max-w-[720px] resize-x` instead of a fixed `w-[340px]` — panes fill the
  center column and share width evenly, capping a single pane at ~720px
  instead of floating in empty space; `resize-x` preserved. Header buttons
  switched to `size="compact"`, `flex-nowrap`, and "Copy response" shortened
  to "Copy" so Clear/Copy/Delete always fit one line. The pane name field is
  now the app's "prominent heading" analog (amber, semibold) — the equivalent
  of the reference's "Review exact change" title.
- `src/renderer/CredentialSettings.tsx`: rebuilt from a full-width flex-wrap
  row of provider blocks into a narrow vertical stack of compact bordered
  rows (label + badge, then input+Save or a full-width Clear button) sized
  for the ~280px right column. Same per-provider save/clear logic and props,
  purely restyled.
- `src/renderer/MemoryPanel.tsx`: `rows={3}` → `rows={2}`, tighter
  padding/gap, `text-xs` textarea.
- `src/renderer/SessionSidebar.tsx`: row height/text tightened (`py-2`→`py-1`,
  `text-xs`→`text-[11px]`, numbered badge `h-5 w-6`→`h-4 w-5`), width fixed at
  an explicit `w-[210px]` (was `w-60`/240px) to land in the requested
  200–220px band independent of the root font-size change.
- `src/renderer/App.tsx`: rebuilt into the three-column shell — left
  `SessionSidebar`, center column (`MemoryPanel` → `PromptBar` → pane row),
  and a new `w-[280px]` right inspector column containing a new "SESSION"
  card (label-left/value-right rows: Name, Panes, Included, Tokens — all
  pulled from existing `session`/`totalTokens` state, nothing invented) above
  the relocated `CredentialSettings`. The "N providers" status dot now reads
  `configuredProviders.length > 0 ? "bg-emerald-500" : "bg-muted-foreground"`
  instead of always rendering green.

## Iteration rounds

**Round 1 — initial three-column build.** Implemented the layout described
above and screenshotted. Result: structurally correct (left rail / center /
right inspector), model select no longer wrapped, pane header buttons fit on
one line, pane no longer floats in a large void. But the pass had made *every*
section micro-label ("MEMORY…", "CREDENTIAL VAULT", "SESSION") amber, which
over-applied the accent — the reference keeps section labels muted and
reserves amber for exactly one prominent heading ("Review exact change").
Sidebar width also measured ~182px on screen, short of the requested
200–220px band because it was set with a rem-based `w-52` that shrank along
with the new root font-size.

**Round 2 — amber scope correction + sidebar width fix.** Reverted the three
section labels (Memory, Credential vault, Session) back to
`text-muted-foreground`, and instead made the pane name field
(`Pane <id>`) amber + semibold as the single prominent-heading analog.
Switched the sidebar to an explicit `w-[210px]` so it lands in range
regardless of root font-size. Re-screenshotted: section labels now read as
muted micro-labels like the reference, amber is reserved for the Z logo, the
active session's left bar, and the pane title — matching the reference's
restrained accent usage. Sidebar measured correctly in range.

**Round 3 — multi-pane width verification.** Accessibility-gated `osascript`
clicks were unavailable in this sandbox (`osascript is not allowed assistive
access`), so per the task's fallback I temporarily changed
`createEmptySession` in `useHarness.ts` to seed 2, then 3, panes, relaunched,
and screenshotted each:
- 2 panes: shared the center column width evenly (~318px each), no
  horizontal scrollbar needed at 1280px window width.
- 3 panes: first two panes shared space and the third pushed the row past
  the available width, correctly triggering the horizontal scrollbar (three
  panes at `min-w-[320px]` = 960px vs. ~793px available column width) — this
  is the intended "only scroll when panes exceed available width" behavior.

Reverted `useHarness.ts` to the original single-pane default afterward;
`git diff --stat` confirms zero net change to that file.

Final screenshot (single pane, default state) confirmed: three-column
structure, tight row heights, amber reserved for logo/active-bar/pane-title,
model select single line, pane header buttons single line, two-axis grid
texture visible but subtle, "0 PROVIDERS" pill dot muted gray (not green).

## Final `npm run verify` output

```
> zenith@0.0.0-private preflight:deps
{"status":"passed","directDependencyCount":35,"lifecycleScripts":"disabled"}

> zenith@0.0.0-private format:check
Checking formatting...
All matched files use Prettier code style!

> zenith@0.0.0-private lint
(clean, --max-warnings 0)

> zenith@0.0.0-private typecheck
(clean)

> zenith@0.0.0-private test:unit
 Test Files  7 passed (7)
      Tests  16 passed (16)

> zenith@0.0.0-private test:integration
 Test Files  2 passed (2)
      Tests  8 passed (8)

> zenith@0.0.0-private test:component
No test files found, exiting with code 0
```

All green.

## Honest gap assessment vs. the reference

Closed:
- Three-column structure (narrow left rail / flexible center / fixed right
  inspector) now matches the reference's skeleton.
- Density is much closer: row heights, paddings, and font sizes are
  meaningfully tighter (root font-size scaling + explicit padding/gap cuts on
  Card, sidebar rows, credential rows, memory panel).
- Panes fill the center column and share width evenly instead of floating in
  a void; single-pane cap (~720px) avoids an oversized lone pane while still
  leaving a reasonable, not huge, margin.
- Model select no longer wraps; pane header buttons fit one line.
- Two-axis, low-opacity grid texture in place.
- Provider-count dot now reflects real state.
- Amber accent scope now matches the reference's restraint (one prominent
  heading + existing icon-mark/active-bar), not applied to every label.

Remaining gaps I did not close (out of scope for a layout-only pass, or
would require inventing data/features the task explicitly forbids):
- The reference's right panel has more visual hierarchy (a numbered
  "G2 OFFLINE LOOP" step list, a "FILE COMMITTED" note) that Zenith has no
  equivalent real data for — left out per the "don't invent fake data"
  constraint, so Zenith's right column is intentionally sparser (Session +
  Credential vault only).
- The reference has a bottom drawer with tabs (Terminal/Tests/Git/Logs/
  Approvals); Zenith has no equivalent feature and none was added, per the
  explicit instruction not to fabricate it.
- The reference's center content has a deep nested-card hierarchy (workspace
  → proposal → diff → replacement) that doesn't map onto Zenith's flatter
  pane-based content; Zenith's single-pane-card content area is inherently
  less visually layered than the reference's multi-level nesting.
- Because `resize-x` is preserved on each pane, a user can still manually
  drag a pane wider/narrower than the flex-computed share; this is expected
  (explicitly required to keep working) but means the "even sharing" is a
  starting layout, not an enforced constraint.
