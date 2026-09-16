# Zenith Visual Redesign — Design Specification (v1)

**Status:** Ready for implementation
**Date:** 2026-09-14
**Scope:** Full visual system overhaul of the existing renderer components. No layout/feature restructuring — sidebar, credential bar, memory panel, prompt bar, and resizable pane columns stay exactly where they are. Every raw inline `style={{...}}` object and unstyled native control gets replaced with a real design system.

**Files this governs:** `src/renderer/App.tsx`, `src/renderer/Pane.tsx`, `src/renderer/PromptBar.tsx`, `src/renderer/SessionSidebar.tsx`, `src/renderer/MemoryPanel.tsx`, `src/renderer/CredentialSettings.tsx`, plus a new `src/renderer/theme.css` (or equivalent) for tokens.

**Direction:** IDE/terminal-adjacent tool, not a consumer chat app. Calm dark surface, high-contrast readable chat text, per-provider color coding for scanability across 2-4 concurrent panes, restrained single accent color reserved for primary actions and active/selected state so it stays meaningful.

---

## 1. Color System

All colors as CSS custom properties on `:root`, default (and initially only) theme is dark. Defined in hex for direct use; grouped by role, not by raw palette step, so a future light theme only needs to remap these same token names — never hardcode a hex value in component code, always reference the token.

### 1.1 Surface layers (background)

```css
:root {
  --bg-base:      #0e0f13;  /* app shell background (App.tsx root) */
  --bg-raised:     #15171c;  /* sidebar, credential bar, memory panel, prompt bar, pane card */
  --bg-raised-hover: #1a1d23; /* hover fill for raised rows (sidebar item hover, provider row hover) */
  --bg-sunken:    #0a0b0e;  /* recessed wells: message list area, textarea, text inputs */
  --bg-overlay:   #1c1f26;  /* dropdown menu surface, tooltips, any popover */
  --bg-selected:  rgba(91, 141, 239, 0.14); /* accent-tinted selection wash, e.g. active session row */
}
```

Rationale for the layering: `--bg-base` < `--bg-raised` < `--bg-overlay` in lightness gives a real elevation order (three visible steps) instead of today's single flat `#101114` everywhere. `--bg-sunken` is *darker* than base — it reads as an inset well (message history, inputs), which is the correct affordance for "content area" vs. "chrome."

### 1.2 Text

```css
:root {
  --text-primary:   #e8eaef;  /* message content, input values, primary labels */
  --text-secondary: #a8adb8;  /* secondary labels, provider names, unselected session names */
  --text-muted:     #666c78;  /* placeholder text, token counts, timestamps, disabled text */
  --text-on-accent: #0e0f13;  /* text/icons placed on top of --accent-500 fills */
}
```

Contrast check against `--bg-sunken` (#0a0b0e): `--text-primary` (#e8eaef) ≈ 15.8:1, `--text-secondary` (#a8adb8) ≈ 8.1:1, `--text-muted` (#666c78) ≈ 3.4:1 — muted is intentionally sub-AA because it's used only for non-essential metadata (token counts, timestamps), never for content or interactive labels.

### 1.3 Borders / dividers

```css
:root {
  --border-subtle: #23262e;  /* card borders, dividers between chrome sections */
  --border-default: #2f333c; /* input borders, select borders, pane card border */
  --border-strong: #3d4149;  /* hover/focus borders before accent kicks in */
}
```

### 1.4 Accent (primary actions, active/selected state)

One accent, used consistently for: primary Send buttons, active session row, focused input borders, checked checkboxes, selected/included pane indicator.

```css
:root {
  --accent-500: #5b8def;  /* primary accent — buttons, active states, focus rings */
  --accent-600: #4272d4;  /* hover/pressed state of accent-filled elements */
  --accent-400: #82a7f5;  /* accent text-on-dark (links, active icon color) */
  --accent-a14: rgba(91, 141, 239, 0.14); /* translucent wash for selection backgrounds */
  --accent-a35: rgba(91, 141, 239, 0.35); /* focus ring */
}
```

### 1.5 Semantic (success / warning / error)

```css
:root {
  --color-success:     #3ecf8e;
  --color-success-bg:  rgba(62, 207, 142, 0.12);
  --color-warning:     #e2a33d;
  --color-warning-bg:  rgba(226, 163, 61, 0.12);
  --color-error:       #f2555f;
  --color-error-bg:    rgba(242, 85, 95, 0.12);
  --color-error-border: rgba(242, 85, 95, 0.4);
}
```

`--color-error` is used for: failed-send banners inside a pane, the "not configured" state text in the credential bar is *not* an error (it's neutral/muted — see §4.7), and destructive-button hover (session delete, pane delete).

### 1.6 Per-provider accent tints — recommendation: yes, use them

**Decision: give each provider a distinct, muted identity color, applied narrowly (a 2px left border on the pane card + a small status dot), never as a background wash.**

Justification: the whole point of this app is scanning 2-4 concurrent conversations at once. Today every pane is visually identical except a text label buried in a `<select>`, so distinguishing "which pane is which provider" requires reading, not glancing. A thin color-coded edge is the same pattern IDEs use for git-status/branch coloring — cheap, doesn't compete with message text (which stays neutral `--text-primary` on `--bg-sunken` regardless of provider), and scales to the fixed provider set (3 today, "add one file" per §4 of the product spec — each new provider just needs one more token).

```css
:root {
  --provider-openai:     #3ecf8e;  /* teal-green */
  --provider-anthropic:  #d97757;  /* warm terracotta */
  --provider-openrouter: #8b7cf6;  /* violet */
}
```

These three are chosen to be mutually distinguishable, distinguishable from `--accent-500` (so a provider tint is never mistaken for the "this is selected/active" signal), and distinguishable from `--color-error`/`--color-success`/`--color-warning` (so a provider-colored pane border is never misread as a status indicator).

### 1.7 Light mode — not built now, don't paint into a corner

No light theme in this pass. To not block one later: every component must reference tokens (`var(--bg-raised)`, etc.), never a literal hex. When a light theme is wanted, add a `[data-theme="light"]` block that redefines the same token names (surfaces get lighter-to-darker instead of darker-to-lighter, text inverts, semantic/accent/provider colors can mostly stay as-is or get slightly desaturated for AA on white). Because layering is expressed as named roles (`base`/`raised`/`sunken`/`overlay`) rather than "the dark color" and "the darker color," the remap is mechanical, not a redesign.

---

## 2. Typography

### 2.1 Font stacks

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Consolas, "Liberation Mono", monospace;
}
```

System stack is correct here: zero load cost, matches OS conventions across win/mac/linux (all three are Electron packaging targets per the product spec), and `--font-mono` covers code blocks inside chat messages without a webfont dependency.

### 2.2 Type scale

Every value is exact — apply verbatim, do not interpolate.

| Token | Size | Line-height | Weight | Used for |
|---|---|---|---|---|
| `--text-2xs` | 11px | 16px | 400 | token-count readout, timestamps |
| `--text-xs` | 12px | 16px | 500 | small uppercase section labels ("SESSIONS", memory panel caption) |
| `--text-sm` | 13px | 18px | 400 | app chrome: sidebar item text, select/input text, credential bar labels |
| `--text-sm-medium` | 13px | 18px | 500 | button label text |
| `--text-base` | 14px | 22px | 400 | chat message body text (needs generous line-height — this is read for extended sessions) |
| `--text-base-medium` | 14px | 22px | 500 | message role label, active session name |
| `--text-mono` | 13px | 20px | 400 | inline code / code blocks inside chat messages, `--font-mono` |

CSS:

```css
:root {
  --text-2xs-size: 11px; --text-2xs-lh: 16px;
  --text-xs-size: 12px;  --text-xs-lh: 16px;
  --text-sm-size: 13px;  --text-sm-lh: 18px;
  --text-base-size: 14px; --text-base-lh: 22px;
  --text-mono-size: 13px; --text-mono-lh: 20px;

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
}
```

Small uppercase labels (`--text-xs` usage) get `letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted);`.

---

## 3. Spacing & Layout Scale

Base unit 4px, exposed as tokens `--space-1` through `--space-10`:

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;

  --radius-sm: 4px;   /* inputs, buttons, dots */
  --radius-md: 8px;   /* pane card, dropdown menu */
  --radius-lg: 10px;  /* not currently needed, reserved */
}
```

Exact application:

- **Sidebar** (`SessionSidebar.tsx`): width `240px` fixed. Outer padding `var(--space-3)` (12px). Gap between items `var(--space-1)` (4px). Each session row: padding `8px 10px` (space-2, ~space-2.5), border-radius `var(--radius-sm)`.
- **Pane card** (`Pane.tsx`): padding `var(--space-4)` (16px) on all sides. Internal vertical gap between header row / selects row / memory toggle / message list / reply row / token line: `var(--space-3)` (12px) each, implemented as `display:flex; flex-direction:column; gap: var(--space-3)`.
- **Buttons**: padding `6px 12px` (secondary/default size). Icon-only or compact buttons (session delete ×): padding `6px 8px`.
- **Text inputs / selects**: padding `8px 10px`.
- **Memory textarea**: padding `10px 12px`.
- **Gap between panes** (`App.tsx` pane row): `var(--space-4)` (16px), row container padding `var(--space-4)` (16px) on all sides.
- **Credential bar** (`CredentialSettings.tsx`): container padding `10px var(--space-4)` (10px 16px). Gap between per-provider groups: `var(--space-6)` (24px). Gap within a provider group (dot, label, input, button): `var(--space-2)` (8px).
- **Prompt bar** (`PromptBar.tsx`): padding `var(--space-3) var(--space-4)` (12px 16px). Gap between input/button/token-count: `var(--space-2)` (8px).
- **Memory panel** (`MemoryPanel.tsx`): padding `var(--space-3) var(--space-4)` (12px 16px). Caption-to-textarea gap: `var(--space-2)` (8px).

---

## 4. Component Treatment

### 4.1 Buttons

Base (`.btn`):

```css
.btn {
  font-family: var(--font-sans);
  font-size: var(--text-sm-size);
  line-height: var(--text-sm-lh);
  font-weight: var(--weight-medium);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-a35);
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
```

**Primary** (`.btn-primary` — Send in PromptBar and per-pane reply Send):
- Default: `background: var(--accent-500); color: var(--text-on-accent); border-color: var(--accent-500);`
- Hover: `background: var(--accent-600); border-color: var(--accent-600);`
- Active/pressed: `background: #3862bd;`
- Disabled (empty prompt): standard disabled treatment above.

**Secondary** (`.btn-secondary` — Clear, Copy response, + Add pane, + New session):
- Default: `background: transparent; color: var(--text-secondary); border-color: var(--border-default);`
- Hover: `background: var(--bg-raised-hover); color: var(--text-primary); border-color: var(--border-strong);`
- Active: `background: var(--bg-sunken);`

**Destructive** (`.btn-destructive` — pane Delete, session delete ×):
- Default: same visual weight as secondary (`background: transparent; color: var(--text-secondary); border-color: var(--border-default);`) — destructive buttons should *not* scream red at rest, only on intent-to-act.
- Hover: `background: var(--color-error-bg); color: var(--color-error); border-color: var(--color-error-border);`
- Active: `background: rgba(242, 85, 95, 0.2);`

### 4.2 Text inputs and the memory textarea

```css
.input, .textarea {
  font-family: var(--font-sans);
  font-size: var(--text-sm-size);
  line-height: var(--text-sm-lh);
  color: var(--text-primary);
  background: var(--bg-sunken);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.input::placeholder, .textarea::placeholder { color: var(--text-muted); }

.input:focus, .textarea:focus {
  outline: none;
  border-color: var(--accent-500);
  box-shadow: 0 0 0 3px var(--accent-a35);
}

.input.is-error, .textarea.is-error {
  border-color: var(--color-error);
  box-shadow: 0 0 0 3px var(--color-error-bg);
}
```

Memory textarea specifically (`MemoryPanel.tsx`): `padding: 10px 12px; min-height: 64px; resize: vertical;` — same border/focus treatment as `.textarea` above.

Error state is not currently used by any input (no client-side validation exists today) but is defined now so the "failed send" work in §5 can reuse it if a credential-format check is ever added — do not wire it up speculatively beyond defining the class.

### 4.3 Select dropdowns — recommendation: keep native `<select>`, restyle it

**Decision: native `<select>`, not a custom dropdown component.**

Justification: each select here has low cardinality (3 providers, and a models list that's typically single-digit-to-low-double-digit) and no need for multi-select, search, or custom row rendering. A custom dropdown means hand-building keyboard navigation (arrow keys, type-ahead, Home/End), focus trapping, click-outside handling, and screen-reader semantics — real code for a control the OS already gives you correctly for free. Electron renders through Chromium, so `appearance: none` plus a hand-drawn chevron reliably restyles the closed-state control across all three packaging targets (win/mac/linux); the one thing you can't restyle is the open dropdown panel itself (OS-native on most platforms), which is an acceptable tradeoff here — this is a utilitarian tool, not a marketing surface.

```css
.select {
  appearance: none;
  -webkit-appearance: none;
  font-family: var(--font-sans);
  font-size: var(--text-sm-size);
  color: var(--text-primary);
  background-color: var(--bg-sunken);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23a8adb8' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 8px 28px 8px 10px; /* extra right padding clears the chevron */
}
.select:hover { border-color: var(--border-strong); }
.select:focus {
  outline: none;
  border-color: var(--accent-500);
  box-shadow: 0 0 0 3px var(--accent-a35);
}
.select:disabled { opacity: 0.45; cursor: not-allowed; }
```

### 4.4 The pane card

```css
.pane-card {
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--provider-color); /* set inline per pane.providerId, see §1.6 */
  border-radius: var(--radius-md);
  padding: var(--space-4);
  width: 340px;
  min-width: 320px;
  max-width: 800px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  resize: horizontal;
  overflow: auto;
}
```

**Header row**: existing layout (include checkbox, name input, Clear/Copy/Delete buttons) — checkbox gets custom styling (see below), name input becomes a borderless-until-focus text field (`background: transparent; border: 1px solid transparent; padding: 4px 6px;` then on hover/focus takes `var(--border-default)`/`var(--accent-500)` respectively, so it reads as a label at rest and an editable field on interaction) styled at `--text-base-medium`.

**Custom checkbox** (`included`, `memoryEnabled`): replace default UA checkbox rendering —
```css
.checkbox {
  appearance: none; -webkit-appearance: none;
  width: 16px; height: 16px;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: var(--bg-sunken);
  cursor: pointer;
  display: inline-grid;
  place-content: center;
}
.checkbox:checked {
  background: var(--accent-500);
  border-color: var(--accent-500);
}
.checkbox:checked::after {
  content: "";
  width: 8px; height: 5px;
  border-left: 1.5px solid var(--text-on-accent);
  border-bottom: 1.5px solid var(--text-on-accent);
  transform: rotate(-45deg) translateY(-1px);
}
.checkbox:focus-visible { box-shadow: 0 0 0 3px var(--accent-a35); }
```

**Message list area**: `background: var(--bg-sunken); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); height: 320px; overflow-y: auto;` — unchanged height/scroll behavior, just tokenized.

**Resize handle affordance**: Chromium's default `resize: horizontal` grip is a small gray triangle in the bottom-right corner that clashes with everything else here. Recommendation: keep native `resize: horizontal` (zero dependency, already works, OS-level drag semantics are correct) but replace the visual affordance:

```css
.pane-card::-webkit-resizer {
  background: transparent;
}
```

Then hand-draw a minimal 3-dot grip in the same corner using a pseudo-element so there's still a visible affordance, but one that matches the palette:

```css
.pane-card {
  position: relative;
}
.pane-card::after {
  content: "";
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 8px;
  height: 8px;
  background-image: radial-gradient(circle, var(--border-strong) 1px, transparent 1.5px);
  background-size: 4px 4px;
  background-repeat: round;
  pointer-events: none;
  opacity: 0.7;
}
.pane-card:hover::after { opacity: 1; }
```

This sits exactly where the native resizer hit-area already is, so the drag target doesn't move — it's a pure paint swap, not a behavior change.

### 4.5 Chat message rows

Current state: undifferentiated `<strong>{role}: </strong><span>{content}</span>`. Replace with a row-based (not bubble) treatment — bubbles read as a consumer chat-app pattern and add horizontal indentation that fights pane width; rows keep full pane width usable for wrapped code/long text, which fits the "dense tool" direction better.

```css
.message-row {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-subtle);
}
.message-row:last-child { border-bottom: none; }

.message-role {
  display: block;
  font-size: var(--text-xs-size);
  line-height: var(--text-xs-lh);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.message-row.role-user .message-role { color: var(--text-muted); }
.message-row.role-assistant .message-role { color: var(--provider-color); } /* inline per pane's provider */

.message-content {
  font-size: var(--text-base-size);
  line-height: var(--text-base-lh);
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
.message-content code, .message-content pre {
  font-family: var(--font-mono);
  font-size: var(--text-mono-size);
  line-height: var(--text-mono-lh);
  background: var(--bg-overlay);
  border-radius: 3px;
  padding: 1px 4px;
}
```

Differentiation: user rows get a muted gray role label ("YOU"); assistant rows get the role label rendered in that pane's `--provider-*` color ("OPENAI" / "ANTHROPIC" / "OPENROUTER") — this is the second (and last) place provider color shows up, reinforcing the pane-edge color from §4.4 without adding a third accent surface.

### 4.6 Session sidebar list items

```css
.session-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-sm);
}
.session-item-button {
  flex: 1;
  text-align: left;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm-size);
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
}
.session-item-button:hover {
  background: var(--bg-raised-hover);
  color: var(--text-primary);
}
.session-item-button.is-active {
  background: var(--bg-selected);
  color: var(--text-primary);
  font-weight: var(--weight-semibold);
  border-color: var(--accent-500);
}
```

Delete (×) button: `.btn-destructive`, compact size (`padding: 6px 8px`), visually hidden at rest and shown on row hover (`.session-item:hover .delete-btn { opacity: 1 }`, base `opacity: 0` transitioning) so the list doesn't show a × next to every single row at rest — reduces visual noise, a common IDE-list pattern (e.g., VS Code's tab close buttons).

### 4.7 Credential bar per-provider row

**Not-configured state** (default, neutral — this is not an error):
```css
.cred-row { display: flex; align-items: center; gap: var(--space-2); }
.cred-status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--text-muted); /* not-configured = muted gray dot */
}
.cred-provider-label {
  font-size: var(--text-sm-size);
  color: var(--text-secondary);
  min-width: 74px; /* aligns provider names in a column across the three rows */
}
```
Input (`type="password"`, API key draft): `.input`, width `160px`. Save button: `.btn-secondary`, disabled (per §4.1 disabled treatment) until the draft field is non-empty.

**Configured state**:
```css
.cred-status-dot.is-configured { background: var(--color-success); }
```
Label stays `--text-secondary`; a small `--text-2xs` "Configured" caption in `--color-success` may sit under/after the label; "Clear key" button uses `.btn-destructive`.

The dot is the fastest scan signal (green vs. gray) — no need to color the whole row, which would fight the error/success semantics reserved for send-failure feedback (§5).

### 4.8 Token-count readout

```css
.token-count {
  font-family: var(--font-mono);
  font-size: var(--text-2xs-size);
  line-height: var(--text-2xs-lh);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
```

Monospace + `tabular-nums` keeps digits from jittering as counts update during streaming; `--text-muted` on the existing raised/sunken surfaces keeps it visually last-priority, never competing with message content or button labels. No background, no border — pure inline text, exactly as today's `opacity: 0.7` intent but with a real token instead of an ad hoc opacity value.

---

## 5. States and Feedback

### 5.1 Hover / focus / active / disabled — canonical values

These are the exact values components above already reference; listed once here as the source of truth:

- **Hover** (non-destructive interactive surface): background steps from `var(--bg-raised)` → `var(--bg-raised-hover)`, or for bordered controls border steps `var(--border-default)` → `var(--border-strong)`. Transition: `120ms ease`.
- **Focus** (any focusable control — button, input, select, checkbox): `box-shadow: 0 0 0 3px var(--accent-a35)`, applied via `:focus-visible` (not bare `:focus`) so mouse clicks don't show a ring, only keyboard/programmatic focus does.
- **Active/pressed**: one step darker than hover — accent buttons go to `#3862bd`, neutral buttons go to `var(--bg-sunken)`.
- **Disabled**: `opacity: 0.45; cursor: not-allowed; pointer-events: none;` — applied uniformly via the shared `.btn:disabled` / `.input:disabled` / `.select:disabled` rules, never a one-off per component.

### 5.2 Failed send — currently a real gap, not just a styling gap

Today, per `Pane.tsx`, `listModels` failures are swallowed to `console.error` with zero UI signal, and per the product description, prompt-send failures (no credential configured, network error) behave the same way — a user can type into a pane, hit Send, and nothing visibly happens if it fails. **This needs a UI state, not only visual polish**, and it needs the pane to hold an error, so this section specifies both the visual treatment and the minimal state shape an implementer must add:

**Required state addition** (implementation note, not styling): `PaneState` (or local `Pane.tsx` state) needs a nullable `lastError: string | null` set by the `onSend`/`sendToPane` catch path and cleared on the next successful send or on dismiss. Without this the visual spec below has nothing to render.

**Visual treatment** — render as an error row inserted at the end of the message list, same row structure as `.message-row` but using error tokens instead of role tokens:

```css
.message-row.role-error {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
}
.message-row.role-error .message-role { color: var(--color-error); }
.message-row.role-error .message-content { color: var(--text-primary); font-size: var(--text-sm-size); }
```

Content: role label reads "ERROR", body text is the failure reason in plain language — `"No API key configured for {provider}."` for the missing-credential case (this one is preventable — see below), `"Request failed: {message}"` for network/API errors, with a small inline `.btn-secondary` "Retry" action sized down (`padding: 4px 8px; font-size: var(--text-2xs-size)`) that re-sends the same last outgoing message.

**Prevent, don't just report, the missing-credential case**: when `pane.providerId` has no configured credential (this is already knowable — `CredentialSettings` fetches `window.zenith.credentials.list()`; that list needs to be lifted or re-fetched at the `Pane`/`App` level so each pane can check it), disable that pane's Send button proactively (`.btn:disabled` treatment) and show inline helper text under the reply input: `"Add an API key for {provider} to send."` in `--text-2xs` / `--color-warning`. This turns an avoidable failure into a disabled state instead of a caught error — strictly better UX, and reuses tokens already defined above.

---

## 6. Iconography — recommendation: text labels only, with two narrow hand-authored SVG exceptions

**Decision: no icon library dependency, no broad icon-only buttons.** This is a dense, utilitarian power-user tool where every current action (Clear, Copy response, Delete, Save, Clear key) is a named, unambiguous text button. Converting them to icon-only buttons would require tooltips to stay unambiguous (extra markup/state per button, worse for a tool used for "extended sessions" where muscle memory on text labels beats icon recall) and would need either hand-authoring 5-6 SVGs with consistent stroke weight or pulling in an icon package — neither pays for itself against "the button already says what it does." The project's own stated bias (§ project docs) is against adding dependencies where a few lines suffice, and here zero lines suffice: keep text.

**Two narrow exceptions, both zero-dependency inline SVG/CSS, already specified above — not a new decision, just enumerated here:**
1. The pane resize-grip affordance (§4.4) — a pure CSS `radial-gradient` dot pattern, not even an SVG file.
2. The select chevron (§4.3) — one hand-authored inline `data:image/svg+xml` background-image, ~120 bytes, no library.

Session delete keeps its literal `×` glyph (already icon-like, zero-cost, universally understood) restyled as `.btn-destructive` per §4.1 rather than replaced with an SVG trash can — same signal, no added asset.

If a future need arises for genuinely icon-appropriate actions (e.g., a send-arrow glyph if Send buttons ever go icon-only in a toolbar-dense revision), hand-author single-purpose inline SVGs at that point (`currentColor` stroke, 16x16 viewBox, 1.5px stroke-width to match the chevron above) rather than adding an icon package — three or four one-off glyphs never justify a dependency.

---

## Summary of new tokens file

Everything in §1–3 belongs in one new file, e.g. `src/renderer/theme.css`, imported once at the app root (`main.tsx` or `App.tsx`). Component files (`Pane.tsx`, `PromptBar.tsx`, etc.) then use plain class names (`.btn`, `.btn-primary`, `.input`, `.select`, `.pane-card`, `.message-row`, …) instead of inline `style={{...}}` objects, with the sole exception of the per-pane `--provider-color` custom property, which is necessarily set inline per pane since it's data-driven (`style={{ "--provider-color": tokenFor(pane.providerId) }}`).
