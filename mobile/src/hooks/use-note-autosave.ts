import type { NoteItem } from "@web/notes/new-note-form/types";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useUpdateNote } from "@/api/notes";

const AUTOSAVE_DELAY_MS = 800;

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export function useNoteAutosave(note: NoteItem) {
  const updateNote = useUpdateNote(note.id);
  const [name, setName] = useState(note.name);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const latest = useRef({ name: note.name, content: note.content });
  const saved = useRef({ name: note.name, content: note.content });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = {
      name: latest.current.name.trim() || saved.current.name,
      content: latest.current.content,
    };
    if (next.name === saved.current.name && next.content === saved.current.content) {
      setStatus((prev) => (prev === "pending" ? "idle" : prev));
      return;
    }
    setStatus("saving");
    try {
      await updateNote.mutateAsync(next);
      saved.current = next;
      setStatus(
        latest.current.content === next.content && latest.current.name.trim() === next.name
          ? "saved"
          : "pending",
      );
    } catch {
      setStatus("error");
    }
  };

  const schedule = (next: { name: string; content: string }) => {
    latest.current = next;
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && timer.current) void flush();
    });
    return () => {
      subscription.remove();
      if (timer.current) void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "saved") return;
    const reset = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(reset);
  }, [status]);

  return {
    name,
    status,
    retry: () => void flush(),
    setName: (value: string) => {
      setName(value);
      schedule({ name: value, content: latest.current.content });
    },
    setContent: (value: string) => {
      schedule({ name: latest.current.name, content: value });
    },
  };
}
