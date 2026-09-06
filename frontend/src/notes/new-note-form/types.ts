import { z } from "zod";

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
});

export type NoteReminder = z.infer<typeof NoteReminderSchema>;

export const NoteItemSchema = NoteBaseSchema.extend({
  id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  reminders: z.array(NoteReminderSchema).default([]),
});

export type NoteItem = z.infer<typeof NoteItemSchema>;
export type NoteBase = z.infer<typeof NoteBaseSchema>;

export const NewNoteBodySchema = NoteBaseSchema.extend({
  reminder_dates: z.array(z.date()),
});

export type NewNoteBody = z.infer<typeof NewNoteBodySchema>;
