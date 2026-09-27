import { WARNING_TINT_CLASSES } from "@/lib/statusColors";
import type { Difficulty, Tag } from "./new-note-form/types";

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export const DIFFICULTY_BADGE_CLASSES: Record<Difficulty, string> = {
  easy: "bg-teal-500/15 text-teal-800 dark:text-teal-400",
  medium: WARNING_TINT_CLASSES,
  hard: "bg-red-500/15 text-red-800 dark:text-red-400",
};

export function getDifficulty(tags: Tag[]): Difficulty {
  const tag = tags.find((t) => t.is_difficulty);
  const value = tag?.name.toLowerCase();
  return value === "easy" || value === "medium" || value === "hard" ? value : "medium";
}
