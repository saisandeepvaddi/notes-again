import { z } from "zod";

export const NoteSchema = z.object({
  name: z.string(),
  content: z.string(),
});

export const NoteItemSchema = NoteSchema.extend({
  id: z.number(),
});
export type NoteItemSchema = z.infer<typeof NoteItemSchema>;
export type Note = z.infer<typeof NoteSchema>;

export const NewNoteBodySchema = NoteSchema.extend({
  reminder_dates: z.array(z.date()),
});

export type NewNoteBody = z.infer<typeof NewNoteBodySchema>;
