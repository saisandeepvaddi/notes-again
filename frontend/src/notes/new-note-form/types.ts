import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

// Per-review grade (Anki's own 4-button scale), distinct from Difficulty --
// that's a sticky, manually-set note label, not a review rating.
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

// A separate concept from tags -- its own table/column, not a kind of tag.
export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type Project = z.infer<typeof ProjectSchema>;

// The list endpoints also say how many live (not trashed) notes each has.
export const ProjectListItemSchema = ProjectSchema.extend({ note_count: z.number() });
export const TagListItemSchema = TagSchema.extend({ note_count: z.number() });

export const ReminderBaseSchema = z.object({
  remind_at: z.coerce.date(),
});

export const NoteBaseSchema = z.object({
  name: z.string(),
  content: z.string(),
});

// Stricter than NoteBaseSchema (which also parses API responses, where we
// don't want a pre-existing empty-named note to fail to load) — this is only
// for validating the new-note form as the user types.
export const NewNoteFormSchema = NoteBaseSchema.extend({
  name: z.string().trim().min(1, "Name is required"),
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
  algorithm: AlgorithmSchema,
  reminders: z.array(NoteReminderSchema).default([]),
  tags: z.array(TagSchema).default([]),
  project: ProjectSchema.nullable().optional().default(null),
});

export type NoteItem = z.infer<typeof NoteItemSchema>;

// One server page of notes plus how many match in total (for "N notes" and
// for knowing when to stop fetching more).
export const NotePageSchema = z.object({
  items: z.array(NoteItemSchema),
  total: z.number(),
});
export type NotePage = z.infer<typeof NotePageSchema>;
export type NoteBase = z.infer<typeof NoteBaseSchema>;

export const NewNoteBodySchema = NoteBaseSchema.extend({
  first_reminder_at: z.date(),
  tag_ids: z.array(z.number()).default([]),
  difficulty: DifficultySchema.default("medium"),
  project_id: z.number().nullable().optional(),
});

export type NewNoteBody = z.infer<typeof NewNoteBodySchema>;
