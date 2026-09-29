---
name: Notes Again
description: A personal, self-hosted spaced-repetition tool for retaining technical notes
colors:
  background: "oklch(0.985 0.004 85)"
  foreground: "oklch(0.21 0.012 60)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.21 0.012 60)"
  popover: "oklch(1 0 0)"
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
typography:
  serif:
    fontFamily: "Literata Variable, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  sans:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.625
  mono:
    fontFamily: "ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "0.45rem"
  md: "0.6rem"
  lg: "0.75rem"
  xl: "1.05rem"
  2xl: "1.35rem"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  badge-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "1rem"
---

# Design System: Notes Again

## Overview

**Creative North Star: "The Field Notebook"**

Notes Again is a single-user tool, not a marketing surface, and its design reads that way on purpose: a compact working notebook of warm paper and green ink rather than a SaaS dashboard. The neutral scale is never cold gray — background, borders, and text all carry a faint warm paper tint (~60–85° hue, chroma ≤ 0.012), and the green (~152°) is reserved for ink: the primary action, the active nav item, focus, links, selection. Keeping green off the surfaces is what lets it read as meaning; an earlier version tinted every neutral with the accent hue and the whole app felt damp and gray-green. Surfaces sit flat against that paper-toned background, separated by hairline rings rather than shadows; shadow is reserved for the handful of things that genuinely float above the page (popovers, selects, comboboxes).

Density is deliberately tight — 28px controls, 12px base UI text, compact spacing — because this is a tool its one user operates dozens of times a day, not a surface meant to feel spacious for a first-time visitor. The one real extravagance is typographic: everything the user actually *reads as content* (a note's title, a page's title, a section heading, the note body itself) switches to a serif face, while every piece of interactive chrome (buttons, badges, dialogs, generic component titles) stays in the sans UI face. That split is the system's signature — it's what makes scanning a grid of technical notes feel like reading a notebook page instead of scrolling a form.

This was extracted from the shipped implementation (shadcn "base-mira" style, "olive" base color, Tailwind v4 + OKLCH tokens), not designed as a seed. No visual rejections have been confirmed by the user beyond what the implementation already embodies.

**Key Characteristics:**
- One accent hue (~152°, green ink) carries primary, ring, active nav, links, and selection; neutrals are warm paper (~85°), never tinted with the accent.
- Flat-by-default: hairline ring (`ring-1 ring-foreground/10`) defines containers; shadow is reserved for floating overlays.
- Serif (Literata) for anything read as content; sans (Inter) for interactive chrome — never mixed within the same role.
- Dense, compact control sizing (28px controls, 12px base text) suited to a power-user tool used many times a day.
- Pill-shaped badges carry all semantic status color (difficulty, recall rating, tags, project) rather than color on text or backgrounds elsewhere.

## Colors

Two families with separate jobs: warm paper neutrals (~60–85°, very low chroma) for every surface, line, and text role, and one green ink (~152°) for everything that means "act here" or "you are here." The warm neutrals sit near the green's complement, so the accent looks livelier without extra saturation.

### Primary
- **Green Ink** (`oklch(0.52 0.12 152)`, dark mode `oklch(0.72 0.13 152)`): the sole accent — primary buttons, active nav state (as a `primary/10` tint with `primary` text), focus ring, links, checked states, text selection, and the caret.

### Neutral
- **Warm Paper** (`oklch(0.985 0.004 85)`, background; dark mode warm charcoal `oklch(0.17 0.006 70)`): the page canvas.
- **Sheet** (`oklch(1 0 0)`, card/popover; dark mode `oklch(0.205 0.007 70)` card, `0.225` popover): content surfaces sit one step lighter than the canvas, so cards lift off the page with no shadow.
- **Shelf** (`oklch(0.97 0.006 85)`, sidebar; dark mode `oklch(0.19 0.006 70)`): one step deeper than the canvas, so navigation recedes behind content.
- **Ink** (`oklch(0.21 0.012 60)`, foreground; dark mode `oklch(0.95 0.006 85)`): primary text. Muted text is `oklch(0.52 0.012 70)` / dark `oklch(0.68 0.01 75)`.
- **Quiet Fill** (`oklch(0.955 0.006 85)`, secondary/muted; dark mode `oklch(0.25 0.007 70)`): secondary buttons, code chips and blocks, table headers. Hover (`accent`) is a separate, slightly deeper step (`0.945 0.008 85`).
- **Hairline** (`oklch(0.905 0.007 85)`, border/input; dark mode a translucent `oklch(1 0 0 / 10%)`): dividers and form-control borders.

### Semantic
- **Clay Red** (`oklch(0.577 0.245 27.325)`, destructive; dark mode `oklch(0.704 0.191 22.216)`): the only non-green, non-paper UI hue, reserved for destructive actions and invalid-state rings. Rendered at low opacity (`/10`, `/20`) as a background tint rather than a solid fill outside of badges.
- **Difficulty/rating chips** (defined in code, not CSS tokens — `frontend/src/notes/difficulty.ts` and `rating.ts`): difficulty is teal/amber/red (easy/medium/hard; teal rather than emerald so "Easy" isn't mistaken for the green brand accent), rating is emerald/amber/red/blue. These are a separate, purpose-built palette layered on top of the base tokens specifically so recall-confidence and note-difficulty stay visually distinct from each other and from the primary accent.

### Data (charts)
- A five-step green ramp on the accent hue (~152°, `chart-1`…`chart-5`, light-to-dark in light mode, reversed in dark mode). Pair with labels; lightness, not hue, separates the steps.

### Named Rules
**The Paper and Ink Rule.** Surfaces, lines, and text are warm paper neutrals; green is ink and appears only where it means action, selection, or focus. Never tint a surface or neutral with the accent hue, and never spend green on decoration. A new color that isn't a deliberate semantic break (destructive red, difficulty/rating chips) is either a paper step or a green step.

## Typography

**Serif Font:** Literata Variable (with `serif` fallback)
**Sans Font:** Inter Variable (with `sans-serif` fallback)
**Mono Font:** system monospace stack (no custom webfont)

**Character:** A working notebook, not a marketing page — Inter runs the interface itself (dense, neutral, functional), while Literata is reserved for anything the user is actually reading, giving note content a calmer, more book-like texture than the chrome around it.

### Hierarchy
- **Content title** (Literata, semibold, `text-lg`/`text-sm` depending on context): page titles (`PageHeader`), a note's own name wherever it appears (card title, detail page, table row) — always serif, never the sans "heading" token.
- **Chrome heading** (Inter via `font-heading` → `font-sans`, medium, `text-sm`): generic dialog/sheet/alert-dialog/Card titles — component chrome that isn't itself "content."
- **Body** (Inter, `text-xs/relaxed` ≈ 12px/1.625): the default UI text size across nearly all controls and labels — deliberately small and dense.
- **Note body** (Literata, `text-sm`/1.5 via `.markdown-content`): rendered markdown note content, with its own heading/list/code/table rules layered on the same tokens.
- **Label** (Inter, `text-[0.625rem]`, medium): badges and the `xs` button size — the smallest text in the system.
- **Mono** (system mono, `text-xs`): code blocks, inline code, API token display, CodeMirror editor content, JSON import preview.

### Named Rules
**The Reading Serif Rule.** Anything the user reads as content — a note's title wherever it appears, a page title, a section heading inside a content list — renders in Literata. Anything that is interface chrome around that content — dialogs, sheets, alerts, generic Card titles, buttons, badges — stays in Inter. Never mix the two within the same role.

## Layout

A fixed collapsible sidebar (icon-collapse mode on desktop, sheet overlay on mobile with its own header trigger) plus a single content column per route; `PageHeader` standardizes title + description + actions across every page. Notes render as a fixed-height card grid (`NoteCard` is a hard `h-72`, not `h-fit`) so rows stay aligned regardless of content length — overflow is clipped, not scrolled, with a bottom gradient fade signaling truncation. Density is uniformly tight: 28px (`h-7`) is the default control height, 12px (`text-xs`) the default UI text size, and spacing between related elements is usually `gap-1.5`–`gap-2`. Touch targets are bumped to 44px minimum only under `@media (pointer: coarse)`, leaving the compact mouse sizing untouched — the density is a deliberate choice for a keyboard/mouse power-user tool, not an oversight to fix.

## Elevation & Depth

Hybrid, and the split is deliberate: surfaces at rest are flat, separated from the page by a `ring-1 ring-foreground/10` hairline instead of a shadow (cards, dialogs, the sidebar in its default docked variant). Shadow (`shadow-md`) is added only to content that floats and needs to visually separate from arbitrary page content behind it — popovers, selects, comboboxes — always paired with the same ring, never shadow alone.

### Shadow Vocabulary
- **Floating overlay** (`box-shadow` via Tailwind's `shadow-md`, combined with `ring-1 ring-foreground/10`): popover, select dropdown, combobox dropdown.
- **Ambient (rare)** (`shadow-sm`): the sidebar's floating variant and inset content area — a much softer touch than the overlay shadow.

### Named Rules
**The Flat-By-Default Rule.** A surface docked in the normal document flow (card, dialog, sidebar) gets a ring, never a shadow. Shadow is earned only by floating above unrelated content.

## Shapes

A single radius scale derived from one `--radius: 0.75rem` base (`sm` = ×0.6, `md` = ×0.8, `lg` = ×1, `xl` = ×1.4, `2xl` = ×1.8, up to `4xl` = ×2.6), so every corner in the system is a fixed ratio of one number. Controls (buttons, inputs, selects) use `md` (0.6rem); containers (cards, popovers, selects' dropdowns) use `lg` (0.75rem); dialogs use `xl` (1.05rem, and the mobile alert-dialog bottom sheet takes just the top corners at `xl` before becoming a fully rounded centered dialog on desktop). Badges are the one fully circular shape (`rounded-full`) in the system — pill-shaped status chips are the system's signature small-shape idiom. Borders are hairline and low-contrast throughout (`ring-foreground/10`, `border-input`); nothing in the system uses a heavy or high-contrast border.

## Components

### Buttons
- **Shape:** `md` radius (0.6rem), border-transparent by default (color communicated via fill, not stroke).
- **Primary:** green-ink fill, primary-foreground text; hovers to 80% opacity rather than a darker shade.
- **Secondary:** quiet-fill; hover mixes 5% foreground into the surface color (`color-mix(in oklch, ...)`) rather than swapping to a fixed darker token.
- **Outline / Ghost:** transparent at rest, filled with `input`/`muted` on hover; ghost has no border at all.
- **Destructive:** low-opacity red fill (`/10` at rest, `/20` on hover) rather than a solid red button — the same restrained-semantic-color treatment as the badge system.
- **Sizing:** eight sizes (`xs`/`sm`/`default`/`lg` plus an `icon` variant of each) all in the 20–32px range — every size sits below the 44px touch guidance by design; touch compensation happens at the `(pointer: coarse)` layer, not by growing the button itself.

### Badges
- **Shape:** fully circular ends (`rounded-full`), `1.25rem` tall — the system's only pill shape.
- **Role:** the primary carrier of semantic status color — difficulty (easy/medium/hard), recall rating (again/hard/good/easy), tags, and project chips are all badges with variant-specific tint, never plain colored text.
- **Interactive badges** (tag/project chips): `cursor-pointer`, filter to a route on click, get a tooltip with the full label since width is capped and truncated.

### Cards
- **Corner style:** `lg` radius (0.75rem).
- **Background:** the `card` sheet, one step lighter than the page canvas; together with the ring that gives depth without a shadow.
- **Shadow strategy:** none at rest (see Elevation & Depth); the ring alone defines the edge.
- **Signature instance — `NoteCard`:** fixed `h-72` height regardless of content, a stretched-link header (the whole title bar is clickable via an `::after` pseudo-element, with the delete button raised above it via `z-10` so it stays independently clickable), and a bottom gradient fade (`bg-linear-to-t from-card to-transparent`) signaling clipped overflow instead of scrolling.

### Inputs / Fields
- **Style:** `md` radius, translucent fill (`bg-input/20`, `/30` in dark mode) rather than a solid input background, hairline border.
- **Focus:** border shifts to `ring` color plus a soft 2px ring at 30% opacity — never a glow or shadow-based focus treatment.
- **Error:** border and ring shift to the destructive token at reduced opacity, mirroring the destructive button treatment.

### Navigation
- **Sidebar:** icon+label items, active state takes a `primary/10` green tint with `primary` text and `font-medium` (hover stays on the neutral `sidebar-accent`, so only the current location is green); collapses to icon-only with a smooth width/padding transition rather than disappearing. Nav is a flat list, not nested — this is a shallow, task-oriented app (Home, All Notes, Review, Import, Organize, Trash, Settings), not a deep IA.

### Markdown / Reading Surface
- **`.markdown-content`:** the shared rendering rules for both the editor's content area and read-only note display — serif body text, a compact heading scale (h1–h6 all `mt`/`mb` in the 1–4 spacing range), muted-background code chips, and dual-theme syntax highlighting (Shiki) that only needs a dark-mode override since the light theme's inline colors already match.

## Do's and Don'ts

### Do:
- **Do** keep every note-facing title (card, detail page, table row, page header) in Literata serif; keep every piece of surrounding interface chrome in Inter sans — see **The Reading Serif Rule**.
- **Do** define container depth with a hairline ring (`ring-1 ring-foreground/10`) at rest; add `shadow-md` only when a surface floats above unrelated page content (popover, select, combobox) — see **The Flat-By-Default Rule**.
- **Do** carry semantic status (difficulty, recall rating, tags) as badge fills, not colored text or full-color solid backgrounds elsewhere.
- **Do** keep surfaces and neutrals on warm paper and spend green only on action, selection, and focus — see **The Paper and Ink Rule**.
- **Do** compensate for the deliberately compact (20–32px) control sizing with the `(pointer: coarse)` media query rather than growing controls for every user.

### Don't:
- **Don't** add a second UI accent hue; route new emphasis through green ink at a different lightness/chroma, or through the established destructive/difficulty/rating palettes.
- **Don't** put shadows on resting cards, dialogs, or the docked sidebar — that breaks the flat-by-default elevation model this system is built on.
- **Don't** render note titles or page titles in the sans/heading font, or generic dialog/component chrome in serif — the two faces are role-locked, not a stylistic mix-and-match.
- **Don't** treat this as a marketing/persuade surface (no hero imagery, no decorative illustration, no gradient-heavy visual language) — it's a personal utility tool and its restraint is intentional, not a placeholder waiting for "real" design.
