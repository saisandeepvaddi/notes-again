import type { Rating } from "./new-note-form/types";

// `caption` is plain-language recall wording: the labels alone (Again/Hard/
// Good/Easy) are Anki jargon, and Hard/Easy also collide with a note's
// separate Easy/Medium/Hard difficulty label, which means something else.
export const RATING_OPTIONS: { value: Rating; label: string; caption: string }[] = [
  { value: "again", label: "Again", caption: "Forgot it" },
  { value: "hard", label: "Hard", caption: "Struggled" },
  { value: "good", label: "Good", caption: "Remembered" },
  { value: "easy", label: "Easy", caption: "Effortless" },
];

export const RATING_BADGE_CLASSES: Record<Rating, string> = {
  again: "bg-red-500/15 text-red-700 dark:text-red-400",
  hard: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  good: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  easy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};
