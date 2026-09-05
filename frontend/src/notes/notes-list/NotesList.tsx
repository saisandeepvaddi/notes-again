import { NoteCard } from "../NoteCard";
import { useNotes } from "./useNotes";

function NotesList() {
  const { data: notes } = useNotes();
  return (
    <div className="flex gap-2 w-full">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
}

export default NotesList;
