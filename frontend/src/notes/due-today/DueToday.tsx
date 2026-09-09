import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { NoteCard } from "../NoteCard";
import { useDueNotes } from "../notes-list/useDueNotes";

export function DueToday() {
  const { data: notes } = useDueNotes();

  if (notes.length === 0) {
    return <p className="text-muted-foreground">Nothing due right now. Nice work.</p>;
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          {notes.length} note{notes.length === 1 ? "" : "s"} due for review
        </p>
        <Button render={<Link to="/review" />}>Start Review</Button>
      </div>
      <div className="flex flex-wrap gap-2 w-full">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </div>
    </div>
  );
}
