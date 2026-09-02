import { useNotes } from "./useNotes";

function NotesList() {
  const { data: notes } = useNotes();
  console.log("notes:", notes);
  return (
    <div>
      {notes.map((note) => (
        <div key={note.id}>
          <h2>{note.name}</h2>
        </div>
      ))}
    </div>
  );
}

export default NotesList;
