import { describe, expect, it } from "vitest";
import {
  emptyNewNoteDraft,
  hasNewNoteDraft,
  NEW_NOTE_DRAFT_KEY,
  readNewNoteDraft,
  writeNewNoteDraft,
  type DraftStorage,
} from "../src/notes/new-note-form/newNoteDraft";

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("new-note drafts", () => {
  it("round-trips writing and all note settings", () => {
    const storage = memoryStorage();
    const draft = {
      ...emptyNewNoteDraft(),
      name: "Soil 🌱",
      content: "## Observation\n\nKeep **living roots**.",
      difficulty: "hard" as const,
      project: { id: 3, name: "Garden", paused: true },
      tags: [{ id: 8, name: "seasonal", is_difficulty: false }],
      statusChoice: "note-only" as const,
    };
    writeNewNoteDraft(storage, draft);
    expect(readNewNoteDraft(storage)).toEqual(draft);
  });

  it("removes storage when the draft is empty", () => {
    const storage = memoryStorage();
    writeNewNoteDraft(storage, { ...emptyNewNoteDraft(), name: "A draft" });
    writeNewNoteDraft(storage, emptyNewNoteDraft());
    expect(storage.getItem(NEW_NOTE_DRAFT_KEY)).toBeNull();
    expect(readNewNoteDraft(storage)).toBeNull();
  });

  it("preserves drafts containing only body text or settings", () => {
    expect(hasNewNoteDraft({ ...emptyNewNoteDraft(), content: " " })).toBe(true);
    expect(hasNewNoteDraft({ ...emptyNewNoteDraft(), difficulty: "easy" })).toBe(true);
    expect(hasNewNoteDraft({ ...emptyNewNoteDraft(), statusChoice: "paused" })).toBe(true);
    expect(hasNewNoteDraft(emptyNewNoteDraft())).toBe(false);
  });

  it.each(["not JSON", "null", "{}", '{"version":2}', '{"version":1,"name":42}'])(
    "ignores invalid or unsupported stored data: %s",
    (raw) => {
      const storage = memoryStorage();
      storage.setItem(NEW_NOTE_DRAFT_KEY, raw);
      expect(readNewNoteDraft(storage)).toBeNull();
      expect(storage.getItem(NEW_NOTE_DRAFT_KEY)).toBe(raw);
    },
  );

  it("does not hide storage failures from the caller", () => {
    const unavailable = () => {
      throw new Error("Storage unavailable");
    };
    const storage = { getItem: unavailable, setItem: unavailable, removeItem: unavailable };
    expect(() => readNewNoteDraft(storage)).toThrow("Storage unavailable");
    expect(() => writeNewNoteDraft(storage, { ...emptyNewNoteDraft(), name: "Draft" })).toThrow(
      "Storage unavailable",
    );
  });
});

describe("new note defaults", () => {
  const defaults = { enabled: true, status: "note-only", difficulty: "hard" } as const;

  it("starts a blank draft from enabled defaults and does not count them as writing", () => {
    const draft = emptyNewNoteDraft(defaults);
    expect(draft).toMatchObject({ difficulty: "hard", statusChoice: "note-only" });
    expect(hasNewNoteDraft(draft, defaults)).toBe(false);
    expect(hasNewNoteDraft({ ...draft, difficulty: "easy" }, defaults)).toBe(true);
  });

  it("ignores defaults that are switched off", () => {
    expect(emptyNewNoteDraft({ ...defaults, enabled: false })).toEqual(emptyNewNoteDraft());
  });
});
