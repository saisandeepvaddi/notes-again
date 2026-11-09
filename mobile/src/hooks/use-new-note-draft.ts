import {
  emptyNewNoteDraft,
  hasNewNoteDraft,
  readNewNoteDraft,
  writeNewNoteDraft,
  type DraftStorage,
  type NewNoteDraft,
} from "@web/notes/new-note-form/newNoteDraft";
import { File, Paths } from "expo-file-system";
import { useRef, useState } from "react";

const storage: DraftStorage = {
  getItem: (key) => {
    if (process.env.EXPO_OS === "web") return globalThis.localStorage.getItem(key);
    const file = new File(Paths.document, `${key}.json`);
    return file.exists ? file.textSync() : null;
  },
  setItem: (key, value) => {
    if (process.env.EXPO_OS === "web") return globalThis.localStorage.setItem(key, value);
    const file = new File(Paths.document, `${key}.json`);
    const temporary = new File(Paths.document, `${key}.tmp`);
    temporary.create({ overwrite: true });
    temporary.write(value);
    temporary.moveSync(file, { overwrite: true });
  },
  removeItem: (key) => {
    if (process.env.EXPO_OS === "web") return globalThis.localStorage.removeItem(key);
    const file = new File(Paths.document, `${key}.json`);
    if (file.exists) file.delete();
  },
};

function load() {
  try {
    const draft = readNewNoteDraft(storage);
    return { draft: draft ?? emptyNewNoteDraft(), saved: true, restored: draft !== null };
  } catch {
    return { draft: emptyNewNoteDraft(), saved: false, restored: false };
  }
}

export function useNewNoteDraft() {
  const [initial] = useState(load);
  const [draft, setDraft] = useState(initial.draft);
  const [saved, setSaved] = useState(initial.saved);
  const [restored, setRestored] = useState(initial.restored);
  const latest = useRef(initial.draft);

  const persist = (next: NewNoteDraft) => {
    try {
      writeNewNoteDraft(storage, next);
      setSaved(true);
      return true;
    } catch {
      setSaved(false);
      return false;
    }
  };

  const update = (patch: Partial<NewNoteDraft>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    persist(next);
  };

  const discard = () => {
    const next = emptyNewNoteDraft();
    if (!persist(next)) return false;
    latest.current = next;
    setDraft(next);
    setRestored(false);
    return true;
  };

  return { draft, saved, restored, update, discard, hasDraft: hasNewNoteDraft(draft) };
}
