import { z } from "zod";

const DatesBaseSchema = z.object({
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const ReminderBaseSchema = z.object({
  remind_at: z.coerce.date(),
});

export const ReminderItemSchema = z.object({
  ...ReminderBaseSchema.shape,
  ...DatesBaseSchema.shape,
  id: z.number(),
});

export const NoteBaseSchema = z.object({
  name: z.string(),
  content: z.string(),
});

export const NoteItemSchema = NoteBaseSchema.extend({
  id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  reminders: z
    .array(
      z.object({
        id: z.number(),
        remind_at: z.coerce.date(),
      }),
    )
    .default([]),
});

export type NoteItem = z.infer<typeof NoteItemSchema>;
export type NoteBase = z.infer<typeof NoteBaseSchema>;

export const NewNoteBodySchema = NoteBaseSchema.extend({
  reminder_dates: z.array(z.date()),
});

export type NewNoteBody = z.infer<typeof NewNoteBodySchema>;
