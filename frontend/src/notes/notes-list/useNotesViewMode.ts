import { useState } from "react";

export type NotesViewMode = "grid" | "table";

const STORAGE_KEY = "notes-view-mode";

function readStored(): NotesViewMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "table" ? "table" : "grid";
  } catch {
    return "grid";
  }
}

// Per-viewer display preference, not app data — localStorage is the right
// tool here rather than anything server-backed.
export function useNotesViewMode() {
  const [mode, setModeState] = useState<NotesViewMode>(readStored);

  function setMode(next: NotesViewMode) {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return [mode, setMode] as const;
}
