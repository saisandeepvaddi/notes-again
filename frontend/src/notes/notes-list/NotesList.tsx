import { Button } from "@/components/ui/button";
import { isNone } from "@/utils/general";
import { useState } from "react";
import { NoteCard } from "../NoteCard";
import { NoteGrid } from "../NoteGrid";
import { TagFilterBar } from "../TagFilterBar";
import { useNotes } from "./useNotes";

interface NotesListProps {
  tagId?: number;
}

function NotesList({ tagId }: NotesListProps) {
  const [noteDate, setNoteDate] = useState<Date | undefined>(undefined);
  const { data: notes } = useNotes({
    date: noteDate,
    tagId,
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TagFilterBar activeTagId={tagId} />
        {isNone(noteDate) ? (
          <Button size="sm" variant="outline" onClick={() => setNoteDate(new Date())}>
            Show only today
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setNoteDate(undefined)}>
            Show All
          </Button>
        )}
      </div>
      {notes.length === 0 ? (
        <p className="text-muted-foreground">No notes yet.</p>
      ) : (
        <NoteGrid>
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </NoteGrid>
      )}
    </div>
  );
}

export default NotesList;
