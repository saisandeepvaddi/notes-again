import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const RatingSchema = z.enum(["again", "hard", "good", "easy"]);
export type Rating = z.infer<typeof RatingSchema>;

export const AlgorithmSchema = z.enum(["sm2", "fsrs"]);
export type Algorithm = z.infer<typeof AlgorithmSchema>;

export const TagSchema = z.object({
  id: z.number(),
  name: z.string(),
  is_difficulty: z.boolean(),
});

export type Tag = z.infer<typeof TagSchema>;

export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  paused: z.boolean().default(false),
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectListItemSchema = ProjectSchema.extend({
  note_count: z.number(),
  paused_count: z.number().default(0),
  note_only_count: z.number().default(0),
});
export const TagListItemSchema = TagSchema.extend({
  note_count: z.number(),
  paused_count: z.number().default(0),
  note_only_count: z.number().default(0),
});

export const ReminderBaseSchema = z.object({
  remind_at: z.coerce.date(),
});

export const NoteBaseSchema = z.object({
  name: z.string(),
  content: z.string(),
});

export const NewNoteFormSchema = NoteBaseSchema.extend({
  name: z.string().trim().min(1, "Name is required"),
});

export const NoteReminderSchema = z.object({
  id: z.number(),
  remind_at: z.coerce.date(),
  reviewed_at: z.coerce.date().optional().nullable().default(null),
  rating: z.string().optional().nullable().default(null),
});

export type NoteReminder = z.infer<typeof NoteReminderSchema>;

export const NoteItemSchema = NoteBaseSchema.extend({
  id: z.number(),
  uid: z.string().optional(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  ease_factor: z.number(),
  interval_days: z.number(),
  algorithm: AlgorithmSchema,
  paused_at: z.coerce.date().nullable().optional().default(null),
  in_review: z.boolean().default(true),
  reminders: z.array(NoteReminderSchema).default([]),
  tags: z.array(TagSchema).default([]),
  project: ProjectSchema.nullable().optional().default(null),
});

export type NoteItem = z.infer<typeof NoteItemSchema>;

export const NotePageSchema = z.object({
  items: z.array(NoteItemSchema),
  total: z.number(),
});
export type NotePage = z.infer<typeof NotePageSchema>;

export const NoteIdsSchema = z.object({ ids: z.array(z.number()), total: z.number() });
export type NoteBase = z.infer<typeof NoteBaseSchema>;

export const NewNoteBodySchema = NoteBaseSchema.extend({
  first_reminder_at: z.date(),
  tag_ids: z.array(z.number()).default([]),
  difficulty: DifficultySchema.default("medium"),
  project_id: z.number().nullable().optional(),
  paused: z.boolean().optional(),
  in_review: z.boolean().optional(),
});

export type NewNoteBody = z.infer<typeof NewNoteBodySchema>;
