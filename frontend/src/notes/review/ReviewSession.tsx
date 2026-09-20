import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useState } from "react";
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
            <div className="flex w-full flex-col gap-2">
              <p className="text-sm font-medium">How well did you remember this?</p>
              <RatingButtons reminderId={pendingReminder.id} onRated={advance} />
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
