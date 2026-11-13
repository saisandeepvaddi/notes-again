import { z } from "zod";
import { DifficultySchema } from "./new-note-form/types";

export const NEW_NOTE_DEFAULTS_KEY = "notes-again.new-note-defaults.v1";

const DefaultsSchema = z.object({
  enabled: z.boolean(),
  status: z.enum(["active", "paused", "note-only"]),
  difficulty: DifficultySchema,
});

export type NewNoteDefaults = z.infer<typeof DefaultsSchema>;

export interface DefaultsStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const DEFAULT_NEW_NOTE_DEFAULTS: NewNoteDefaults = {
  enabled: false,
  status: "active",
  difficulty: "medium",
};

export function readNewNoteDefaults(storage: DefaultsStorage): NewNoteDefaults {
  try {
    const raw = storage.getItem(NEW_NOTE_DEFAULTS_KEY);
    const parsed = raw ? DefaultsSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : DEFAULT_NEW_NOTE_DEFAULTS;
  } catch {
    return DEFAULT_NEW_NOTE_DEFAULTS;
  }
}

export function writeNewNoteDefaults(storage: DefaultsStorage, defaults: NewNoteDefaults) {
  storage.setItem(NEW_NOTE_DEFAULTS_KEY, JSON.stringify(defaults));
}
