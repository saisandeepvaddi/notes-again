import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const TagSchema = z.object({
  id: z.number(),
  name: z.string(),
  is_difficulty: z.boolean(),
});

export type Tag = z.infer<typeof TagSchema>;

export const ReminderBaseSchema = z.object({
  remind_at: z.coerce.date(),
});

export const NoteBaseSchema = z.object({
  name: z.string(),
  content: z.string(),
});

export const NoteReminderSchema = z.object({
  id: z.number(),
  remind_at: z.coerce.date(),
  reviewed_at: z.coerce.date().optional().nullable().default(null),
  // A free string, not DifficultySchema: reviews made before this app only
  // had Easy/Medium/Hard may still carry old rating vocabulary ("again",
  // "good") in history, and that's fine to just display as-is.
  rating: z.string().optional().nullable().default(null),
});

export type NoteReminder = z.infer<typeof NoteReminderSchema>;

export const NoteItemSchema = NoteBaseSchema.extend({
  id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  ease_factor: z.number(),
  interval_days: z.number(),
  reminders: z.array(NoteReminderSchema).default([]),
  tags: z.array(TagSchema).default([]),
});

export type NoteItem = z.infer<typeof NoteItemSchema>;
export type NoteBase = z.infer<typeof NoteBaseSchema>;

export const NewNoteBodySchema = NoteBaseSchema.extend({
  first_reminder_at: z.date(),
  tag_ids: z.array(z.number()).default([]),
  difficulty: DifficultySchema.default("medium"),
});

export type NewNoteBody = z.infer<typeof NewNoteBodySchema>;
