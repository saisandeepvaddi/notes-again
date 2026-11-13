import { useRef, useState } from "react";
import { DEFAULT_NEW_NOTE_DEFAULTS, readNewNoteDefaults } from "../newNoteDefaults";
import {
  emptyNewNoteDraft,
  readNewNoteDraft,
  writeNewNoteDraft,
  type NewNoteDraft,
} from "./newNoteDraft";

function initialDraft() {
  try {
    const defaults = readNewNoteDefaults(window.localStorage);
    const draft = readNewNoteDraft(window.localStorage);
    return {
      defaults,
      draft: draft ?? emptyNewNoteDraft(defaults),
      restored: draft !== null,
      saved: true,
    };
  } catch {
    return {
      defaults: DEFAULT_NEW_NOTE_DEFAULTS,
      draft: emptyNewNoteDraft(),
      restored: false,
      saved: false,
    };
  }
}

export function useNewNoteDraft() {
  const [initial] = useState(initialDraft);
  const [draft, setDraft] = useState(initial.draft);
  const [saved, setSaved] = useState(initial.saved);
  const [restored, setRestored] = useState(initial.restored);
  const latest = useRef(initial.draft);

  const persist = (next = latest.current) => {
    try {
      writeNewNoteDraft(window.localStorage, next, initial.defaults);
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
    const next = emptyNewNoteDraft(initial.defaults);
    if (!persist(next)) return false;
    latest.current = next;
    setDraft(next);
    setRestored(false);
    return true;
  };

  return { draft, defaults: initial.defaults, saved, restored, update, persist, discard };
}
