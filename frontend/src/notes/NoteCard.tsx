import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { formatRelative } from "date-fns";
import { Trash2Icon } from "lucide-react";
import { useDeleteNote } from "./hooks/useDeleteNote";
import type { NoteItem } from "./new-note-form/types";
import { NoteContent } from "./NoteContent";

interface NoteCardProps {
  note: NoteItem;
}

export function NoteCard({ note }: NoteCardProps) {
  const { mutateAsync: deleteNote } = useDeleteNote({
    noteId: note.id,
  });
  return (
    <Card>
      <CardHeader className="flex items-center justify-between font-semibold text-xl">
        <h2>{note.name}</h2>
        <Button size="icon-sm" onClick={() => deleteNote()} variant={"destructive"}>
          <Trash2Icon />
        </Button>
      </CardHeader>
      <CardContent>
        <NoteContent markdown={note.content} />
      </CardContent>
      <CardFooter>
        <div className="flex gap-2">
          {note.reminders.map((reminder) => {
            return (
              <div key={reminder.id} className="truncate">
                {formatRelative(reminder.remind_at, new Date())}
              </div>
            );
          })}
        </div>
      </CardFooter>
    </Card>
  );
}
