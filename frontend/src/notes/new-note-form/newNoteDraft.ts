import { z } from "zod";
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

export function emptyNewNoteDraft(): NewNoteDraft {
  return {
    version: 1,
    name: "",
    content: "",
    difficulty: "medium",
    project: null,
    tags: [],
    statusChoice: null,
  };
}

export function hasNewNoteDraft(draft: NewNoteDraft) {
  return (
    draft.name !== "" ||
    draft.content !== "" ||
    draft.difficulty !== "medium" ||
    draft.project !== null ||
    draft.tags.length > 0 ||
    draft.statusChoice !== null
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

export function writeNewNoteDraft(storage: DraftStorage, draft: NewNoteDraft) {
  if (hasNewNoteDraft(draft)) {
    storage.setItem(NEW_NOTE_DRAFT_KEY, JSON.stringify(draft));
  } else {
    storage.removeItem(NEW_NOTE_DRAFT_KEY);
  }
}
