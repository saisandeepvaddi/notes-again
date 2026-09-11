import { NoteGrid } from "../NoteGrid";
import { TrashedNoteCard } from "./TrashedNoteCard";
import { useTrashedNotes } from "./useTrashedNotes";

export function TrashList() {
  const { data: notes } = useTrashedNotes();

  if (notes.length === 0) {
    return <p className="text-muted-foreground">Trash is empty.</p>;
  }

  return (
    <NoteGrid>
      {notes.map((note) => (
        <TrashedNoteCard key={note.id} note={note} />
      ))}
    </NoteGrid>
  );
}
