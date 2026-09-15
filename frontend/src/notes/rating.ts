import type { Rating } from "./new-note-form/types";

export const RATING_OPTIONS: { value: Rating; label: string }[] = [
  { value: "again", label: "Again" },
  { value: "hard", label: "Hard" },
  { value: "good", label: "Good" },
  { value: "easy", label: "Easy" },
];

export const RATING_BADGE_CLASSES: Record<Rating, string> = {
  again: "bg-red-500/15 text-red-700 dark:text-red-400",
  hard: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  good: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  easy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};
