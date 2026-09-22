---
name: Note and Learn
description: A personal, self-hosted spaced-repetition tool for retaining technical notes
colors:
  background: "oklch(0.99 0.006 145)"
  foreground: "oklch(0.22 0.02 150)"
  card: "oklch(0.99 0.006 145)"
  card-foreground: "oklch(0.22 0.02 150)"
  popover: "oklch(0.99 0.006 145)"
  popover-foreground: "oklch(0.22 0.02 150)"
  primary: "oklch(0.5 0.1 150)"
  primary-foreground: "oklch(0.99 0.01 140)"
  secondary: "oklch(0.96 0.015 140)"
  secondary-foreground: "oklch(0.32 0.03 150)"
  muted: "oklch(0.96 0.015 140)"
  muted-foreground: "oklch(0.53 0.03 150)"
  accent: "oklch(0.96 0.015 140)"
  accent-foreground: "oklch(0.32 0.03 150)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.89 0.02 140)"
  input: "oklch(0.89 0.02 140)"
  ring: "oklch(0.62 0.09 150)"
  sidebar: "oklch(0.99 0.006 145)"
  sidebar-foreground: "oklch(0.22 0.02 150)"
  sidebar-primary: "oklch(0.5 0.1 150)"
  sidebar-accent: "oklch(0.96 0.015 140)"
  sidebar-border: "oklch(0.89 0.02 140)"
  chart-1: "oklch(0.88 0.011 106.6)"
  chart-2: "oklch(0.58 0.031 107.3)"
  chart-3: "oklch(0.466 0.025 107.3)"
  chart-4: "oklch(0.394 0.023 107.4)"
  chart-5: "oklch(0.286 0.016 107.4)"
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

# Design System: Note and Learn

## Overview

**Creative North Star: "The Field Notebook"**

Note and Learn is a single-user tool, not a marketing surface, and its design reads that way on purpose: a compact, olive-and-paper working notebook rather than a SaaS dashboard. The neutral scale is never true gray — background, borders, and text all carry a faint moss tint from the same ~150° hue family that the primary accent lives in, so the whole interface feels like it was cut from one material instead of a gray shell with a brand color dropped on top. Surfaces sit flat against that paper-toned background, separated by hairline rings rather than shadows; shadow is reserved for the handful of things that genuinely float above the page (popovers, selects, comboboxes).

Density is deliberately tight — 28px controls, 12px base UI text, compact spacing — because this is a tool its one user operates dozens of times a day, not a surface meant to feel spacious for a first-time visitor. The one real extravagance is typographic: everything the user actually *reads as content* (a note's title, a page's title, a section heading, the note body itself) switches to a serif face, while every piece of interactive chrome (buttons, badges, dialogs, generic component titles) stays in the sans UI face. That split is the system's signature — it's what makes scanning a grid of technical notes feel like reading a notebook page instead of scrolling a form.

This was extracted from the shipped implementation (shadcn "base-mira" style, "olive" base color, Tailwind v4 + OKLCH tokens), not designed as a seed. No visual rejections have been confirmed by the user beyond what the implementation already embodies.

**Key Characteristics:**
- One accent hue (~150°, moss/olive) carries primary, ring, and sidebar-primary; neutrals share its tint rather than being true gray.
- Flat-by-default: hairline ring (`ring-1 ring-foreground/10`) defines containers; shadow is reserved for floating overlays.
- Serif (Literata) for anything read as content; sans (Inter) for interactive chrome — never mixed within the same role.
- Dense, compact control sizing (28px controls, 12px base text) suited to a power-user tool used many times a day.
- Pill-shaped badges carry all semantic status color (difficulty, recall rating, tags, project) rather than color on text or backgrounds elsewhere.

## Colors

The palette is a single warm-olive hue family stretched across every role — there is no separate cool gray; borders, muted surfaces, and body text all sit in the same ~140–150° hue as the primary accent, just at different lightness/chroma.

### Primary
- **Moss Green** (`oklch(0.5 0.1 150)`, dark mode `oklch(0.68 0.13 150)`): the sole accent — primary buttons, active nav state, focus ring, links, checked states. Also drives the sidebar's active-item color via the same token.

### Neutral
- **Warm Paper** (`oklch(0.99 0.006 145)`, background/card/popover/sidebar; dark mode `oklch(0.16 0.018 150)`): the base surface. Card and popover share this value with background at rest — separation comes from the hairline ring, not a tonal shift.
- **Near-Black Moss** (`oklch(0.22 0.02 150)`, foreground; dark mode `oklch(0.96 0.015 140)`): primary text.
- **Pale Sage** (`oklch(0.96 0.015 140)`, secondary/muted/accent — all three share this exact value; dark mode `oklch(0.26 0.02 148)`): the one "quiet surface" token, used for secondary buttons, muted backgrounds (code chips, table headers), and hover/expanded states alike.
- **Soft Sage Line** (`oklch(0.89 0.02 140)`, border/input; dark mode a translucent `oklch(1 0 0 / 12%)`): hairline dividers and form-control borders.

### Semantic
- **Clay Red** (`oklch(0.577 0.245 27.325)`, destructive; dark mode `oklch(0.704 0.191 22.216)`): the only hue that breaks from the moss family, reserved for destructive actions and invalid-state rings. Rendered at low opacity (`/10`, `/20`) as a background tint rather than a solid fill outside of badges.
- **Difficulty/rating chips** (defined in code, not CSS tokens — `frontend/src/notes/difficulty.ts` and `rating.ts`): emerald for easy/"remembered", amber for medium/"struggled", red for hard/"forgot it", blue for "good". These are a separate, purpose-built palette layered on top of the base tokens specifically so recall-confidence and note-difficulty stay visually distinct from each other and from the primary accent.

### Data (charts)
- A five-step warm-neutral ramp at a distinct ~107° hue (`chart-1`…`chart-5`, light-to-dark), deliberately *not* sharing the ~150° UI hue — chart color is its own vocabulary, not a tint of the brand accent.

### Named Rules
**The One Hue Rule.** Every neutral and the primary accent share one hue family (~140–150°). A new UI color that isn't a deliberate semantic break (destructive red, difficulty/rating chips) should be a lightness/chroma step within that family, not a new hue.

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
- **Primary:** moss-green fill, primary-foreground text; hovers to 80% opacity rather than a darker shade.
- **Secondary:** pale-sage fill; hover mixes 5% foreground into the surface color (`color-mix(in oklch, ...)`) rather than swapping to a fixed darker token.
- **Outline / Ghost:** transparent at rest, filled with `input`/`muted` on hover; ghost has no border at all.
- **Destructive:** low-opacity red fill (`/10` at rest, `/20` on hover) rather than a solid red button — the same restrained-semantic-color treatment as the badge system.
- **Sizing:** eight sizes (`xs`/`sm`/`default`/`lg` plus an `icon` variant of each) all in the 20–32px range — every size sits below the 44px touch guidance by design; touch compensation happens at the `(pointer: coarse)` layer, not by growing the button itself.

### Badges
- **Shape:** fully circular ends (`rounded-full`), `1.25rem` tall — the system's only pill shape.
- **Role:** the primary carrier of semantic status color — difficulty (easy/medium/hard), recall rating (again/hard/good/easy), tags, and project chips are all badges with variant-specific tint, never plain colored text.
- **Interactive badges** (tag/project chips): `cursor-pointer`, filter to a route on click, get a tooltip with the full label since width is capped and truncated.

### Cards
- **Corner style:** `lg` radius (0.75rem).
- **Background:** same token as page background (`card` ≡ `background` in light mode) — depth comes from the ring, not a tonal card surface.
- **Shadow strategy:** none at rest (see Elevation & Depth); the ring alone defines the edge.
- **Signature instance — `NoteCard`:** fixed `h-72` height regardless of content, a stretched-link header (the whole title bar is clickable via an `::after` pseudo-element, with the delete button raised above it via `z-10` so it stays independently clickable), and a bottom gradient fade (`bg-linear-to-t from-card to-transparent`) signaling clipped overflow instead of scrolling.

### Inputs / Fields
- **Style:** `md` radius, translucent fill (`bg-input/20`, `/30` in dark mode) rather than a solid input background, hairline border.
- **Focus:** border shifts to `ring` color plus a soft 2px ring at 30% opacity — never a glow or shadow-based focus treatment.
- **Error:** border and ring shift to the destructive token at reduced opacity, mirroring the destructive button treatment.

### Navigation
- **Sidebar:** icon+label items, active state fills with the sage `sidebar-accent` token and adds `font-medium`; collapses to icon-only with a smooth width/padding transition rather than disappearing. Nav is a flat list, not nested — this is a shallow, task-oriented app (Home, All Notes, Review, Import, Organize, Trash, Settings), not a deep IA.

### Markdown / Reading Surface
- **`.markdown-content`:** the shared rendering rules for both the editor's content area and read-only note display — serif body text, a compact heading scale (h1–h6 all `mt`/`mb` in the 1–4 spacing range), muted-background code chips, and dual-theme syntax highlighting (Shiki) that only needs a dark-mode override since the light theme's inline colors already match.

## Do's and Don'ts

### Do:
- **Do** keep every note-facing title (card, detail page, table row, page header) in Literata serif; keep every piece of surrounding interface chrome in Inter sans — see **The Reading Serif Rule**.
- **Do** define container depth with a hairline ring (`ring-1 ring-foreground/10`) at rest; add `shadow-md` only when a surface floats above unrelated page content (popover, select, combobox) — see **The Flat-By-Default Rule**.
- **Do** carry semantic status (difficulty, recall rating, tags) as badge fills, not colored text or full-color solid backgrounds elsewhere.
- **Do** keep new UI colors within the existing ~140–150° hue family unless the need is a genuine semantic break like destructive red — see **The One Hue Rule**.
- **Do** compensate for the deliberately compact (20–32px) control sizing with the `(pointer: coarse)` media query rather than growing controls for every user.

### Don't:
- **Don't** add a second UI accent hue; route new emphasis through moss-green at a different lightness/chroma, or through the established destructive/difficulty/rating palettes.
- **Don't** put shadows on resting cards, dialogs, or the docked sidebar — that breaks the flat-by-default elevation model this system is built on.
- **Don't** render note titles or page titles in the sans/heading font, or generic dialog/component chrome in serif — the two faces are role-locked, not a stylistic mix-and-match.
- **Don't** treat this as a marketing/persuade surface (no hero imagery, no decorative illustration, no gradient-heavy visual language) — it's a personal utility tool and its restraint is intentional, not a placeholder waiting for "real" design.
