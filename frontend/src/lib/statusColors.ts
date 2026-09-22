// Shared amber "needs attention" / emerald "positive" tint recipes, reused
// wherever the app signals a warning or a completed/positive state outside
// the difficulty/rating badge system (which has its own per-value palette
// but draws these same two shades for its "medium"/"hard" and "easy" states).
//
// Light-mode text is -800, not -700: composited over this module's own
// 15%-opacity tint on the app's light background, -700 measured under WCAG
// AA's 4.5:1 floor (as low as 4.37:1) with some instances passing with no
// real margin (4.55:1). -800 clears every measured case with margin
// (6.19-6.42:1). Dark mode's -400 already had plenty of room and is
// unchanged. See difficulty.ts for the badge-specific values this mirrors.
export const WARNING_TINT_CLASSES = "bg-amber-500/15 text-amber-800 dark:text-amber-400";
export const WARNING_TEXT_CLASSES = "text-amber-800 dark:text-amber-400";
export const SUCCESS_TINT_CLASSES = "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400";
export const SUCCESS_DOT_CLASSES = "bg-emerald-500";
// For a button surface rather than a text/badge chip: tints the whole
// control instead of just coloring text, so it needs its own recipe rather
// than reusing SUCCESS_TINT_CLASSES on top of a text color.
export const SUCCESS_BUTTON_CLASSES =
  "border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:bg-emerald-500/10";
