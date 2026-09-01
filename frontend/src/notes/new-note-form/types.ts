import { z } from "zod";

export const NoteSchema = z.object({
  name: z.string(),
  content: z.string(),
});

export type Note = z.infer<typeof NoteSchema>;

export const NewNoteBodySchema = NoteSchema.extend({
  reminder_dates: z.array(z.date()),
});

export type NewNoteBody = z.infer<typeof NewNoteBodySchema>;
