import { z } from "zod";
import type { NewNoteDefaults } from "../newNoteDefaults";
import { DifficultySchema, ProjectSchema, TagSchema } from "./types";

export const NEW_NOTE_DRAFT_KEY = "notes-again.new-note-draft.v1";

const DraftSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  content: z.string(),
  difficulty: DifficultySchema,
  project: ProjectSchema.nullable(),
  tags: z.array(TagSchema),
  statusChoice: z.enum(["active", "paused", "note-only"]).nullable(),
});

export type NewNoteDraft = z.infer<typeof DraftSchema>;

export interface DraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function emptyNewNoteDraft(defaults?: NewNoteDefaults): NewNoteDraft {
  const active = defaults?.enabled ? defaults : null;
  return {
    version: 1,
    name: "",
    content: "",
    difficulty: active?.difficulty ?? "medium",
    project: null,
    tags: [],
    statusChoice: active && active.status !== "active" ? active.status : null,
  };
}

export function hasNewNoteDraft(draft: NewNoteDraft, defaults?: NewNoteDefaults) {
  const baseline = emptyNewNoteDraft(defaults);
  return (
    draft.name !== "" ||
    draft.content !== "" ||
    draft.difficulty !== baseline.difficulty ||
    draft.project !== null ||
    draft.tags.length > 0 ||
    draft.statusChoice !== baseline.statusChoice
  );
}

export function readNewNoteDraft(storage: DraftStorage): NewNoteDraft | null {
  const raw = storage.getItem(NEW_NOTE_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeNewNoteDraft(
  storage: DraftStorage,
  draft: NewNoteDraft,
  defaults?: NewNoteDefaults,
) {
  if (hasNewNoteDraft(draft, defaults)) {
    storage.setItem(NEW_NOTE_DRAFT_KEY, JSON.stringify(draft));
  } else {
    storage.removeItem(NEW_NOTE_DRAFT_KEY);
  }
}
