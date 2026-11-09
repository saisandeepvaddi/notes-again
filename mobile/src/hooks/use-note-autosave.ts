import type { NoteItem } from "@web/notes/new-note-form/types";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useUpdateNote } from "@/api/notes";
import { createNoteSaveQueue, type SaveStatus } from "@/utils/note-save-queue";

export type { SaveStatus } from "@/utils/note-save-queue";

export function useNoteAutosave(note: NoteItem) {
  const updateNote = useUpdateNote(note.id);
  const [name, setName] = useState(note.name);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [queue] = useState(() =>
    createNoteSaveQueue(
      { name: note.name, content: note.content },
      (text) => updateNote.mutateAsync(text),
      setStatus,
    ),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void queue.flush().catch(() => undefined);
    });
    return () => {
      subscription.remove();
      void queue.flush().catch(() => undefined);
    };
  }, [queue]);

  useEffect(() => {
    if (status !== "saved") return;
    const reset = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(reset);
  }, [status]);

  return {
    name,
    status,
    flush: queue.flush,
    retry: () => void queue.flush().catch(() => undefined),
    setName: (value: string) => {
      setName(value);
      queue.update({ name: value });
    },
    setContent: (value: string) => {
      queue.update({ content: value });
    },
  };
}
