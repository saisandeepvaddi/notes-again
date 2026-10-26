---
name: Notes Again
description: A personal, self-hosted spaced-repetition tool for retaining freeform markdown notes
colors:
  background: "oklch(0.985 0.004 85)"
  foreground: "oklch(0.21 0.012 60)"
  card: "oklch(0.995 0.002 85)"
  card-foreground: "oklch(0.21 0.012 60)"
  popover: "oklch(0.995 0.002 85)"
  popover-foreground: "oklch(0.21 0.012 60)"
  primary: "oklch(0.52 0.12 152)"
  primary-foreground: "oklch(0.99 0.005 85)"
  secondary: "oklch(0.955 0.006 85)"
  secondary-foreground: "oklch(0.3 0.012 60)"
  muted: "oklch(0.955 0.006 85)"
  muted-foreground: "oklch(0.52 0.012 70)"
  accent: "oklch(0.945 0.008 85)"
  accent-foreground: "oklch(0.21 0.012 60)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.905 0.007 85)"
  input: "oklch(0.905 0.007 85)"
  ring: "oklch(0.62 0.11 152)"
  sidebar: "oklch(0.97 0.006 85)"
  sidebar-foreground: "oklch(0.21 0.012 60)"
  sidebar-primary: "oklch(0.52 0.12 152)"
  sidebar-accent: "oklch(0.935 0.008 85)"
  sidebar-border: "oklch(0.905 0.007 85)"
  chart-1: "oklch(0.85 0.07 152)"
  chart-2: "oklch(0.72 0.11 152)"
  chart-3: "oklch(0.6 0.12 152)"
  chart-4: "oklch(0.48 0.1 152)"
  chart-5: "oklch(0.36 0.07 152)"
  dark-background: "oklch(0.17 0.006 70)"
  dark-foreground: "oklch(0.95 0.006 85)"
  dark-card: "oklch(0.205 0.007 70)"
  dark-popover: "oklch(0.225 0.007 70)"
  dark-primary: "oklch(0.72 0.13 152)"
  dark-primary-foreground: "oklch(0.17 0.02 152)"
  dark-secondary: "oklch(0.25 0.007 70)"
  dark-secondary-foreground: "oklch(0.93 0.006 85)"
  dark-muted-foreground: "oklch(0.68 0.01 75)"
  dark-accent: "oklch(0.27 0.008 70)"
  dark-destructive: "oklch(0.704 0.191 22.216)"
  dark-border: "oklch(1 0 0 / 10%)"
  dark-input: "oklch(1 0 0 / 15%)"
  dark-ring: "oklch(0.6 0.12 152)"
  dark-sidebar: "oklch(0.19 0.006 70)"
  status-teal: "oklch(0.704 0.14 182.503)"
  status-amber: "oklch(0.769 0.188 70.08)"
  status-red: "oklch(0.637 0.237 25.331)"
  status-blue: "oklch(0.623 0.214 259.815)"
  status-emerald: "oklch(0.696 0.17 162.48)"
typography:
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.625
  control:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.625
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
  page-title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  chrome-title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  note-title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  note-body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  reading-serif:
    fontFamily: "Literata Variable, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "0.45rem"
  md: "0.6rem"
  lg: "0.75rem"
  xl: "1.05rem"
  2xl: "1.35rem"
  3xl: "1.65rem"
  4xl: "1.95rem"
  full: "9999px"
spacing:
  hairline-gap: "2px"
  chip-gap: "6px"
  control-gap: "8px"
  group-gap: "16px"
  page-padding: "16px"
  card-padding: "16px"
  card-padding-sm: "12px"
  header-gap: "24px"
  control-height-xs: "20px"
  control-height-sm: "24px"
  control-height: "28px"
  control-height-lg: "32px"
  touch-target: "44px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-outline:
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-ghost:
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
  button-destructive:
    textColor: "{colors.destructive}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-icon:
    rounded: "{rounded.md}"
    size: "28px"
  badge-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  badge-outline:
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "16px"
  note-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.lg}"
    padding: "16px"
    height: "288px"
    width: "260px–320px"
  input:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
    height: "28px"
  dialog:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.xl}"
    padding: "16px"
    width: "384px"
  popover:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.lg}"
    padding: "10px"
    width: "288px"
  tooltip:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  sidebar-item:
    textColor: "{colors.sidebar-foreground}"
    typography: "{typography.body}"
    rounded: "calc({rounded.sm} + 2px)"
    padding: "8px"
  sidebar-item-hover:
    backgroundColor: "{colors.sidebar-accent}"
  sidebar-item-active:
    textColor: "{colors.primary}"
---

# Design System: Notes Again

## Overview

**Creative North Star: "The Field Notebook"**

Notes Again is a single-user tool, not a marketing surface, and its design reads that way on purpose: a compact working notebook of warm paper and green ink rather than a SaaS dashboard. The neutral scale is never cold gray. Background, borders and text all carry a faint warm paper tint (hue 60–85°, chroma ≤ 0.012), and the green (hue 152°) is reserved for ink: the primary action, the active nav item, focus, links, selection, the caret. Keeping green off the surfaces is what lets it read as meaning; an earlier version tinted every neutral with the accent hue and the whole app felt damp and gray-green. Surfaces sit flat against that paper-toned background, separated by hairline rings rather than shadows; shadow is reserved for the handful of things that genuinely float above the page.

Density is deliberately tight (28px controls, 12px base UI text, 6–8px gaps) because this is a tool its one user operates dozens of times a day, not a surface meant to feel spacious for a first-time visitor. Type is one family, Geist, for the whole interface, with a single role split: the user's own notes (a note's title wherever it appears, and its body) render in the *reading font*, a per-device setting that is Geist by default or Literata serif for a more book-like page. Everything else, from page titles to badges, is interface and stays in Geist whatever that setting says.

This was extracted from the shipped implementation (shadcn `base-mira` style on Base UI, `olive` base color, Tailwind v4, OKLCH custom properties in `frontend/src/styles.css`, Phosphor icons). The mobile app (`mobile/`) follows the same system sized for touch; see `mobile/AGENTS.md`. No visual rejections have been confirmed by the user beyond what the implementation already embodies.

**Key Characteristics:**

- One accent hue (152°, green ink) carries primary, ring, active nav, links, selection and the caret; neutrals are warm paper (60–85°), never tinted with the accent.
- Flat by default: a hairline ring (`ring-1 ring-foreground/10`) defines docked containers; shadow appears only on content that floats.
- Geist for the interface; the reading font (Geist or Literata, chosen per device in Settings → Appearance) only for note titles and note bodies.
- Dense, compact control sizing (20–32px controls, 12px base text) for a keyboard-and-mouse power user, compensated to 44px only on coarse pointers.
- Pill-shaped badges and tinted chips carry all semantic status color (difficulty, recall rating, review state); text and surfaces stay paper and ink.

## Colors

Two families with separate jobs: warm paper neutrals (hue 60–85°, chroma ≤ 0.012) for every surface, line and text role, and one green ink (hue 152°) for everything that means "act here" or "you are here". The warm neutrals sit near the green's complement, so the accent looks livelier without extra saturation. A small, separate status palette (Tailwind's teal, amber, red, blue and emerald at 15% tints) handles difficulty, recall ratings and warnings. Every token is redefined under `.dark`; the dark values are listed in the frontmatter as `dark-*`.

### Primary

- **Green Ink** (`oklch(0.52 0.12 152)`; dark `oklch(0.72 0.13 152)` with near-black `oklch(0.17 0.02 152)` text on it): the sole accent. Primary buttons, links (`underline-offset-2`), checked switches and checkboxes, the sidebar's active item (as a `primary/10` tint with `primary` text, `primary/15` on hover), the sidebar's due-count badge, the review progress fill, the review-complete check mark, and selected note cards (`bg-primary/5` plus a 2px `ring-primary`).
- **Focus Ring** (`oklch(0.62 0.11 152)`; dark `oklch(0.6 0.12 152)`): a slightly lighter green used only for focus. Controls shift their border to `ring` and add a 2px `ring/30` halo; badges, tabs and toggles use a 3px `ring/50` halo.
- **Selection and caret**: text selection is `color-mix(in oklch, var(--primary) 22%, transparent)`, and inputs, textareas and contenteditable regions take `caret-color: var(--primary)`. Inside CodeMirror code blocks the caret is `foreground` and selection is `accent`, so code reads as its own surface.

### Neutral

- **Warm Paper** (`oklch(0.985 0.004 85)`; dark warm charcoal `oklch(0.17 0.006 70)`): the page canvas behind everything.
- **Sheet** (`oklch(0.995 0.002 85)`, card and popover, tinted just off pure white; dark `oklch(0.205 0.007 70)` card and a step lighter `oklch(0.225 0.007 70)` popover): content surfaces sit one step lighter than the canvas, so cards lift off the page with no shadow. Dialogs, sheets, toasts and the editor surface use it too.
- **Shelf** (`oklch(0.97 0.006 85)`, sidebar; dark `oklch(0.19 0.006 70)`): one step deeper than the canvas, so navigation recedes behind content. Its hover step is `sidebar-accent` (`oklch(0.935 0.008 85)`; dark `oklch(0.25 0.007 70)`).
- **Ink** (`oklch(0.21 0.012 60)`; dark `oklch(0.95 0.006 85)`): primary text, and the background of tooltips, which invert to ink with paper text.
- **Pencil** (`oklch(0.52 0.012 70)`; dark `oklch(0.68 0.01 75)`), `muted-foreground`: secondary text, descriptions, timestamps, placeholders, inactive icons, CodeMirror line numbers.
- **Quiet Fill** (`oklch(0.955 0.006 85)`, both `secondary` and `muted`; dark `oklch(0.25 0.007 70)`): secondary buttons and badges, ghost-button hover, selected segments in segmented controls, inline code chips, code blocks, table headers, skeletons. Secondary text on it is `oklch(0.3 0.012 60)`.
- **Hover Step** (`oklch(0.945 0.008 85)`, `accent`; dark `oklch(0.27 0.008 70)`): highlighted rows in selects, menus and comboboxes; a separate, slightly deeper step than Quiet Fill so a highlighted item still reads on a muted surface.
- **Hairline** (`oklch(0.905 0.007 85)`, `border` and `input`; dark translucent white at 10% for borders and 15% for inputs): dividers, table rules, form-control borders, segmented-control frames, dashed empty-state outlines. Input fills are the same color at 20% (`bg-input/20`, 30% in dark).

### Semantic

- **Clay Red** (`oklch(0.577 0.245 27.325)`; dark `oklch(0.704 0.191 22.216)`), `destructive`: destructive actions and invalid states only. It always appears as a tint (`destructive/10` at rest, `/20` on hover; `/20` and `/30` in dark) with red text, never as a solid red fill. Invalid controls take a destructive border plus a 2px `destructive/20` ring.
- **Difficulty chips** (`frontend/src/notes/difficulty.ts`): Easy is teal (`bg-teal-500/15 text-teal-800`, dark text `teal-400`), Medium is amber (`bg-amber-500/15 text-amber-800`, dark `amber-400`), Hard is red (`bg-red-500/15 text-red-800`, dark `red-400`). Easy is teal rather than emerald so it is never mistaken for the green ink.
- **Recall ratings** (`frontend/src/notes/rating.ts`): Again red (`text-red-700`), Hard amber, Good blue (`text-blue-700`), Easy emerald, each as a 15% tint with dark-mode `-400` text. The review-complete tally uses solid 8px dots in the same hues (`red-500`, `amber-500`, `blue-500`, `emerald-500`).
- **Warning and success** (`frontend/src/lib/statusColors.ts`): amber 15% tint with `amber-800` text for overdue reminders and other warnings; emerald 15% tint with an emerald/50 border for the "Rated Good · Today" undo chip. Emerald means "done" here, distinct from green ink, which means "act".

### Data (charts)

- A five-step green ramp on the accent hue (`chart-1` `oklch(0.85 0.07 152)` to `chart-5` `oklch(0.36 0.07 152)`, reversed in dark mode). Defined but not used by any screen yet; when a chart arrives, pair the steps with labels and let lightness, not hue, separate them.

### Named Rules

**The Paper and Ink Rule.** Surfaces, lines and text are warm paper neutrals; green is ink and appears only where it means action, selection or focus. Never tint a surface or neutral with the accent hue, and never spend green on decoration. A new color that isn't a deliberate semantic break (destructive red, the status palette) is either a paper step or a green step.

**The Fifteen Percent Rule.** Status color is a 15% tint of the hue with a deep (`-700`/`-800`) text of the same hue in light mode and a `-400` text in dark mode. Never a solid saturated fill, never colored text on a plain surface.

## Typography

**Interface Font:** Geist Variable (`@fontsource-variable/geist`, fallback `sans-serif`)
**Reading Font:** `--reading-font`: Geist Variable by default, Literata Variable (`@fontsource-variable/literata`, fallback `serif`) when the device picks serif. Stored per device in localStorage by `frontend/src/lib/readingFont.ts` and applied as `data-reading-font` on `<html>` by an init script before first paint.
**Mono Font:** Geist Mono Variable (`@fontsource-variable/geist-mono`, fallback `ui-monospace, monospace`)

**Character:** A working notebook, not a marketing page. Geist runs the interface: dense, neutral, functional. The reading font is the user's own choice for their own writing, so a note can read as clean sans or as a calmer serif page without the chrome around it changing.

### Hierarchy

- **Note title** (reading font, 600, `text-xl` / 1.25rem on phones and `text-2xl` / 1.5rem from `md` on the detail page, `text-xl` on the review card, `text-sm` / 0.875rem on cards; tight tracking, line height 1.25; table rows keep the table's text size at weight 500): a note's own name wherever it appears.
- **Note body** (reading font, 400, 0.875rem / 1.625 via `.markdown-content`): rendered and edited markdown. Inside it, h1 is 1.5rem, h2 1.25rem, h3 1.125rem, h4–h6 1rem, all 600 with tight tracking and more space above than below.
- **Page title** (Geist, 600, 1.125rem, `tracking-tight`, truncates): `PageHeader`; 404 and route-error titles use the same face at 1.25rem.
- **Chrome title** (Geist via `font-heading`, 500, 0.875rem): dialog, alert-dialog, sheet and Card titles; section headings such as the note details sheet's Review history. Empty-state headings step up to 1rem at 600.
- **Body** (Geist, 400–500, 0.75rem / 1.625, `text-xs/relaxed`): the default UI size for controls, labels, menus and descriptions. Text inputs render at 0.875rem below `md` (so iOS doesn't zoom on focus) and 0.75rem from `md`. Empty-state descriptions use 0.875rem and cap at 60–65ch.
- **Label** (Geist, 500, 0.625rem): badges, `xs` buttons, rating-button captions and keyboard hints — the smallest text in the system.
- **Mono** (Geist Mono, 0.75rem, inline code at 0.85em): code blocks, inline code, CodeMirror content, API tokens, JSON import preview.
- **Numerals**: counts, dates, intervals and tallies use `tabular-nums` so columns of numbers don't jitter.

### Named Rules

**The Reading Font Rule.** Only the user's notes take `font-reading`: a note's title and its body, wherever they appear (card, table row, detail page, review session, trash). Everything else is interface and takes Geist (`font-sans` / `font-heading`), so switching the reading font changes the notes and nothing around them. Never hard-code Literata (`font-serif`) on content; it exists for the Appearance setting's preview.

## Layout

A collapsible sidebar plus a single content column per route. The sidebar is 16rem wide, collapses to a 3rem icon rail on desktop, and becomes an 18rem sheet below 768px, where a sticky top bar (hairline bottom border, sidebar trigger, app name) replaces it. The main area pads 16px on every side. Pages open with `PageHeader` (title, optional description, actions on the right, 24px below), except the note page, whose header is a back link above a title row.

Content columns cap their width per task rather than filling the screen: the note page at `max-w-4xl` (56rem), the review session at `max-w-3xl` (48rem, vertically centered on desktop), the new-note form at `max-w-2xl`, completion and empty screens at `max-w-xl`. Settings uses vertical tabs (11rem wide from `md`) beside the panel and horizontal scrolling tabs on phones.

Notes render in a virtualized card grid: as many columns as fit at a 260px minimum, each card 260–320px wide and a fixed 288px tall, with a 16px gap, so rows stay aligned regardless of content. A table view (choice stored per device in localStorage) shows the same notes as rows. Spacing follows Tailwind's 4px scale and stays tight: 2px inside segmented controls, 6px between chips, 8px between controls, 16px between groups, 24px under a page header.

The 768px breakpoint (`md`) is the only structural one; `sm` (640px) handles small refinements such as showing the save-state label. Touch targets grow to 44px only under `@media (pointer: coarse)`, applied to buttons, sidebar items and alert-dialog actions, leaving the compact mouse sizing alone. Under `prefers-reduced-motion`, all animation and transition durations collapse to 0.01ms except spinners and skeleton pulses.

## Elevation & Depth

Hybrid, and the split is deliberate. Docked surfaces are flat and separated from the page by a `ring-1 ring-foreground/10` hairline instead of a shadow: cards, the review card, dialogs and alert dialogs, the docked sidebar. Depth between canvas, sheet and shelf comes from tonal steps (sheet is one step lighter than the canvas, the sidebar one step deeper). Shadow is added only to things that float over arbitrary content, and always alongside the same hairline ring.

### Shadow Vocabulary

- **Floating overlay** (`shadow-md`: `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`, plus the hairline ring): popovers, select and combobox dropdowns, the editor's code-language menu.
- **Edge overlay** (`shadow-lg`: `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): side sheets and toasts, which slide in from an edge over the page.
- **Ambient** (`shadow-sm`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): the sidebar's floating and inset variants only.
- **Scrim**: dialogs and sheets dim the page with `bg-black/80`; dialogs add a 4px backdrop blur where supported. The review session's sticky rating bar is the one translucent surface (`bg-background/95` with a small backdrop blur) so the note scrolls visibly beneath it.

### Named Rules

**The Flat-By-Default Rule.** A surface docked in the normal document flow (card, dialog, sidebar) gets a ring, never a shadow. Shadow is earned only by floating above unrelated content.

## Shapes

A single radius scale derived from one `--radius: 0.75rem`: `sm` 0.45rem (×0.6), `md` 0.6rem (×0.8), `lg` 0.75rem, `xl` 1.05rem (×1.4), `2xl` 1.35rem, `3xl` 1.65rem, `4xl` 1.95rem. Every corner is a fixed ratio of that one number. Controls (buttons, inputs, selects, toggles, menu items, tooltips, code blocks) use `md`; `xs` buttons and editor toolbar buttons use `sm`; containers (cards, popovers, dropdowns, tab lists, empty states) use `lg`; dialogs use `xl`, and on phones the alert dialog becomes a bottom sheet with only its top corners rounded at `xl`. Checkboxes are 4px. Badges, switches, progress bars and rating dots are fully round, and the pill badge is the system's signature small shape.

Borders are hairline and low-contrast throughout (`ring-foreground/10`, `border-input`). Dashed hairlines mark absence: empty states and the inline status notice on a paused or note-only note. The one heavier line is the 4px neutral left rule on markdown blockquotes, which is part of reading typography, not a card or alert style.

## Components

The feel throughout is refined and restrained: controls are small, quiet at rest, and earn color only through state.

### Buttons

- **Shape:** `md` radius (0.6rem), 1px transparent border by default; color comes from fill, not stroke.
- **Sizes:** `xs` 20px (0.625rem text, `sm` radius), `sm` 24px, `default` 28px, `lg` 32px, each with a square `icon-*` twin. Default horizontal padding is 8px, gap 4px, and icons size to 14px at the default size. All sit below 44px by design; coarse pointers get the 44px minimum.
- **Primary:** green-ink fill with paper text; hover drops the fill to 80% opacity rather than darkening.
- **Secondary:** quiet fill; hover mixes 5% ink into it (`color-mix(in oklch, var(--secondary), var(--foreground) 5%)`).
- **Outline:** hairline border, transparent (dark: `input/30` fill); hover fills `input/50`. Used for the rating buttons and other low-emphasis actions.
- **Ghost:** no border or fill; hover fills `muted` (`muted/50` in dark). The default for toolbar and icon actions such as the note page's details and ⋯ buttons.
- **Destructive:** `destructive/10` tint with red text, `/20` on hover.
- **Link:** green text, underline on hover.
- **States:** focus shifts the border to `ring` with a 2px `ring/30` halo; pressing nudges the button down 1px (`translate-y-px`), except menu triggers; disabled is 50% opacity with pointer events off; an open trigger (`aria-expanded`) keeps its hover fill.

### Badges and Chips

- **Shape:** fully round, 20px tall, 2px × 8px padding, 0.625rem medium text, icons at 10px.
- **Variants:** `secondary` (quiet fill) for projects and tags in pickers and the card's project chip; `outline` (hairline border, `input/20` fill) for tags on cards; `default` (green ink) sparingly; `destructive` as a red tint.
- **Status chips:** difficulty and rating badges apply the Fifteen Percent tints over the base badge. The difficulty badge on the note page is itself a button that opens a three-option menu.
- **Interactive chips:** project and tag chips filter the notes list on click, cap their width (5rem for projects, 7rem for tags on cards) with truncation, and show the full name in a tooltip. Removable chips carry a 10px × at 60% opacity, full on hover.

### Cards and Containers

- **Corner Style:** `lg` (0.75rem).
- **Background:** sheet, with the hairline ring for an edge; no shadow (see Elevation & Depth).
- **Internal Padding:** 16px (`--card-spacing`), 12px for the `sm` size; header, content and footer share it.
- **Text:** 0.75rem / 1.625 body; Card titles in the chrome-title style.

### Inputs and Fields

- **Style:** 28px tall, `md` radius, hairline border, translucent `input/20` fill (`/30` in dark), 2px × 8px padding, placeholder in pencil. Textareas grow with content from a 4rem minimum. Selects share the trigger style and open a floating dropdown with 28px rows highlighted in `accent`.
- **Focus:** border shifts to `ring` plus a 2px `ring/30` halo. No glow, no shadow.
- **Error / Disabled:** destructive border and a 2px `destructive/20` ring; disabled is 50% opacity with a not-allowed cursor.
- **Choice controls:** checkboxes are 16px, 4px radius, filling green when checked; switches are 28 × 16.6px pills, green when on.

### Navigation

- **Sidebar items:** icon (18px) plus label at 0.75rem, 8px padding, radius `sm + 2px`. Hover uses the neutral `sidebar-accent`; the current route takes a `primary/10` tint with green text and medium weight, so only "you are here" is green. A due-review count sits at the right in green tabular numerals. The list is flat: All Notes, Review, Import, Organize, Trash, Settings, then a Projects group and a theme switch (light / dark / system) in the footer.
- **Segmented controls:** a hairline-framed `md` group with 2px padding and gaps, containing ghost buttons; the selected segment fills `muted`. Used for review status (In review / Paused / Note only) and the grid/table view switch.
- **Tabs:** a `muted` track (3px padding, `lg` radius) whose active tab lifts to the canvas color; the Settings sections use them vertically from `md`.

### Overlays

- **Popover:** sheet surface, `lg` radius, 10px padding, 18rem default width, floating shadow plus ring; opens with a 100ms fade and zoom from 95%, sliding 8px from its side.
- **Dialog:** sheet surface, `xl` radius, 16px padding, max 24rem wide, ring but no shadow, black/80 scrim with a slight blur. Alert dialogs lead with a 32px quiet-fill icon tile and become a bottom sheet on phones.
- **Sheet:** slides 2.5rem in from the right over 200ms (ease-in-out), up to 24rem wide (75% of the viewport on phones), edge shadow, close button top right. The note details sheet uses it.
- **Tooltip:** inverted (ink background, paper text), `md` radius, 6px × 12px padding, 0.75rem text, with a small rotated arrow.
- **Toast:** bottom right (centered with 16px insets on phones), sheet surface with a hairline border and edge shadow, max 24rem; swipe right to dismiss. Errors show a red icon; undo actions live in the toast.

### Markdown and the Editor

- **`.markdown-content`:** the shared reading surface for both the MDXEditor content area and read-only rendering: reading-font body, links in green with a 2px underline offset, inline code as a quiet-fill chip at 0.85em, code blocks as `md`-radius quiet-fill panels with 12px padding, tables with hairline cells and a quiet-fill header, images with `md` corners. Syntax highlighting is Shiki with dual themes; only dark mode needs an override.
- **Editor:** MDXEditor's palette variables are mapped onto the tokens (base colors to paper steps, accent colors to `primary` mixes from 6% to 55%), so its menus and selection speak the same language. Code blocks are CodeMirror on a quiet-fill panel with a transparent gutter, a ghost language select, and a delete button that turns red on hover. On the note page the editor sits on the sheet color with a hairline border.

### Signature Components

- **Note card:** fixed 288px height whatever the content length; a stretched link makes the whole title row clickable; hover (always, on touch devices) reveals row actions over a fade from the card color; content overflow is clipped under a 32px fade to the card color rather than scrolled; the footer holds the next-reminder control and project/tag chips. Selected cards in bulk mode take a `primary/5` fill and a 2px green ring.
- **Rating buttons:** four equal outline buttons in a grid, each tinted with its rating's Fifteen Percent colors, showing the label, the interval it would schedule (or a caption such as "Remembered") in 0.625rem, and a 1–4 shortcut hint in the corner that hides on touch. They sit in a sticky, translucent bar under the review card.
- **Review card:** a docked sheet-colored article (20px padding, 28px from `sm`, `lg` radius, hairline ring) with the note title in the reading font and the body as `.markdown-content`; above it a 4px progress track fills with green ink.
- **Save state:** on the note page the autosave state sits in the title row as a 14px icon and label in pencil (Saved, Unsaved changes, Saving… with a spinning icon, or a red "Couldn't save" message); below `sm` only the icon shows.
- **Empty states:** a dashed hairline `lg` box (24px × 40px padding), a 24px pencil icon, a 1rem chrome heading, a 0.875rem description capped at 60–65ch, then actions. Left-aligned in lists, centered on whole-page screens.
- **Loading:** skeletons mirror the real layout (fixed-height card shapes, pill placeholders) and fade in after a 300ms delay over 240ms on an exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`), so fast loads never flash a skeleton.

### Icons

- **Phosphor** (`@phosphor-icons/react`, regular weight; shadcn `iconLibrary: "phosphor"`): one family across the app, sized by the surrounding control (10px in badges, 12–14px in buttons and inline with 0.75rem text, 16px in larger buttons, 18px in the sidebar, 24px for empty-state marks, 32px for the review-complete check). No emoji or unicode glyphs as icons.

## Do's and Don'ts

### Do:

- **Do** keep surfaces and neutrals on warm paper and spend green only on action, selection and focus — see **The Paper and Ink Rule**.
- **Do** put note titles and note bodies in `font-reading` and everything else, page titles included, in Geist — see **The Reading Font Rule**.
- **Do** define docked container depth with the hairline ring (`ring-1 ring-foreground/10`) and add `shadow-md` or `shadow-lg` only to surfaces that float — see **The Flat-By-Default Rule**.
- **Do** carry status as 15% tints with same-hue deep text (difficulty, rating, warning, success) — see **The Fifteen Percent Rule**.
- **Do** build from the existing scale: 28px controls, 0.75rem text, `md` radius for controls and `lg` for containers, 6–8px gaps inside groups and 16px between them.
- **Do** compensate for the compact 20–32px controls with the `(pointer: coarse)` 44px minimum rather than growing controls for every user.
- **Do** use `tabular-nums` for counts, dates and intervals, and theme the browser surfaces from tokens (selection, caret, focus ring) rather than leaving defaults.
- **Do** give every async surface a delayed skeleton, an empty state with a next step, and an error that names what failed.

### Don't:

- **Don't** add a second UI accent hue; route new emphasis through green ink at a different lightness or chroma, or through the established destructive and status palettes.
- **Don't** use emerald where green ink is meant, or green ink to say "done"; emerald is the success status, green ink is the call to act.
- **Don't** put shadows on resting cards, dialogs or the docked sidebar; that breaks the flat-by-default model.
- **Don't** hard-code a face on note content (`font-serif`, `font-sans`) or apply `font-reading` to interface chrome; the reading font is the user's setting for their notes only.
- **Don't** use solid saturated fills for status or destructive actions; tints only.
- **Don't** treat this as a marketing or persuade surface (no hero imagery, decorative illustration or gradient-heavy visual language); its restraint is intentional, not a placeholder waiting for "real" design. Gradients appear only as functional fades to the card color.
