import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useState } from "react";
import { getDifficulty } from "../difficulty";
import { NoteContent } from "../NoteContent";
import { RatingButtons } from "../RatingButtons";
import { useDueNotes } from "../notes-list/useDueNotes";
import type { NoteItem } from "../new-note-form/types";

export function ReviewSession() {
  const { data: dueNotes } = useDueNotes();
  const [queue, setQueue] = useState<NoteItem[]>(() => dueNotes);
  const current = queue[0];

  const advance = () => setQueue((current) => current.slice(1));

  if (!current) {
    return <p className="text-muted-foreground">All caught up — nothing left to review.</p>;
  }

  const pendingReminder = current.reminders.find((reminder) => reminder.reviewed_at === null);

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl">
      <p className="text-muted-foreground">{queue.length} left</p>
      <Card>
        <CardHeader className="font-semibold text-xl">{current.name}</CardHeader>
        <CardContent>
          <NoteContent markdown={current.content} />
        </CardContent>
        <CardFooter>
          {pendingReminder && (
            <RatingButtons
              reminderId={pendingReminder.id}
              currentDifficulty={getDifficulty(current.tags)}
              onRated={advance}
            />
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
