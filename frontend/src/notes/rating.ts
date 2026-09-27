import { SUCCESS_TINT_CLASSES, WARNING_TINT_CLASSES } from "@/lib/statusColors";
import type { Rating } from "./new-note-form/types";

export const RATING_OPTIONS: { value: Rating; label: string; caption: string }[] = [
  { value: "again", label: "Again", caption: "Forgot it" },
  { value: "hard", label: "Hard", caption: "Struggled" },
  { value: "good", label: "Good", caption: "Remembered" },
  { value: "easy", label: "Easy", caption: "Effortless" },
];

export const RATING_BADGE_CLASSES: Record<Rating, string> = {
  again: "bg-red-500/15 text-red-700 dark:text-red-400",
  hard: WARNING_TINT_CLASSES,
  good: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  easy: SUCCESS_TINT_CLASSES,
};
