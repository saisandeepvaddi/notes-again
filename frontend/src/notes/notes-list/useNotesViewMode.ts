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

export function useNotesViewMode() {
  const [mode, setModeState] = useState<NotesViewMode>(readStored);

  function setMode(next: NotesViewMode) {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
    }
  }

  return [mode, setMode] as const;
}
