import { z } from "zod";
import { AlgorithmSchema, type Algorithm } from "@/notes/new-note-form/types";

export { AlgorithmSchema };
export type { Algorithm };

export const SettingsSchema = z.object({ default_algorithm: AlgorithmSchema });
export type Settings = z.infer<typeof SettingsSchema>;

export const ALGORITHM_OPTIONS: { value: Algorithm; label: string; description: string }[] = [
  {
    value: "fsrs",
    label: "FSRS",
    description: "Modern algorithm (FSRS-6); adapts scheduling to your review history.",
  },
  {
    value: "sm2",
    label: "SM-2",
    description: "Classic Anki-style algorithm; simpler, more predictable growth.",
  },
];
