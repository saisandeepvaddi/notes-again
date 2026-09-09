import { Button } from "@/components/ui/button";
import { isNone } from "@/utils/general";
import { useState } from "react";
import { NoteCard } from "../NoteCard";
import { useNotes } from "./useNotes";

function NotesList() {
  const [noteDate, setNoteDate] = useState<Date | undefined>(undefined);
  const { data: notes } = useNotes({
    date: noteDate,
  });
  return (
    <div className="flex flex-wrap gap-2 w-full">
      {isNone(noteDate) ? (
        <Button onClick={() => setNoteDate(new Date())}>Show only today</Button>
      ) : (
        <Button onClick={() => setNoteDate(undefined)}>Show All</Button>
      )}
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
}

export default NotesList;
