import { z } from "zod";

export const NoteSchema = z.object({
  name: z.string(),
  content: z.string(),
});

export type Note = z.infer<typeof NoteSchema>;
