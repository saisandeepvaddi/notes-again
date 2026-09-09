import type { Difficulty, Tag } from "./new-note-form/types";

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export const DIFFICULTY_BADGE_CLASSES: Record<Difficulty, string> = {
  easy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  hard: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export function getDifficulty(tags: Tag[]): Difficulty {
  const tag = tags.find((t) => t.is_difficulty);
  const value = tag?.name.toLowerCase();
  return value === "easy" || value === "medium" || value === "hard" ? value : "medium";
}
