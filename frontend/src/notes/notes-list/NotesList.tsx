import { NoteCard } from "../NoteCard";
import { useNotes } from "./useNotes";

function NotesList() {
  const { data: notes } = useNotes();
  return (
    <div>
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
}

export default NotesList;
