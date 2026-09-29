import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon } from "lucide-react";
import { useState } from "react";
import { NoteContent } from "../NoteContent";
import { NoteTitle } from "../NoteTitle";
import { RatingButtons } from "../RatingButtons";
import type { NoteItem } from "../new-note-form/types";
import { fetchDueNotes, useDueNotes } from "../notes-list/useDueNotes";

export function ReviewSession() {
  const queryClient = useQueryClient();
  const { data: firstPage } = useDueNotes();
  const [queue, setQueue] = useState(firstPage.items);
  const [remaining, setRemaining] = useState(firstPage.total);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const current = queue[0];

  const advance = async () => {
    setReviewedCount((count) => count + 1);
    const rest = queue.slice(1);
    const left = remaining - 1;
    setQueue(rest);
    setRemaining(left);
    if (rest.length > 0 || left <= 0) return;

    setLoadingMore(true);
    try {
      const page = await queryClient.fetchQuery({
        queryKey: ["due-notes"],
        queryFn: fetchDueNotes,
        staleTime: 0,
      });
      setQueue(page.items);
      setRemaining(page.total);
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to load more notes" });
    } finally {
      setLoadingMore(false);
    }
  };

  const restore = (note: NoteItem) => {
    setQueue((notes) => [note, ...notes.filter((n) => n.id !== note.id)]);
    setRemaining((count) => count + 1);
    setReviewedCount((count) => Math.max(0, count - 1));
  };

  if (loadingMore) {
    return (
      <div className="flex flex-col gap-4 w-full max-w-2xl">
        <p className="text-muted-foreground">{remaining.toLocaleString()} left</p>
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Spinner /> Loading the next batch...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!current) {
    return (
      <Card className="w-full max-w-2xl items-center gap-2 px-6 py-12 text-center animate-in fade-in-0 zoom-in-95 duration-200">
        <CheckCircle2Icon className="size-8 text-primary" aria-hidden="true" />
        <p className="font-serif text-lg font-semibold">
          {reviewedCount > 0 ? "Session complete" : "All caught up"}
        </p>
        <p className="text-sm text-muted-foreground">
          {reviewedCount > 0
            ? `Reviewed ${reviewedCount.toLocaleString()} note${reviewedCount === 1 ? "" : "s"} — nothing else due right now.`
            : "Nothing's due right now — check back later."}
        </p>
      </Card>
    );
  }

  const reviewing = current;
  const pendingReminder = current.reminders.find((reminder) => reminder.reviewed_at === null);

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl">
      <p className="text-muted-foreground">{remaining.toLocaleString()} left</p>
      <Card>
        <CardHeader className="font-serif font-semibold text-xl">
          <NoteTitle title={current.name} />
        </CardHeader>
        <CardContent>
          <NoteContent markdown={current.content} />
        </CardContent>
        <CardFooter>
          {pendingReminder && (
            <div className="flex w-full flex-col gap-2">
              <p className="text-sm font-medium">How well did you remember this?</p>
              <RatingButtons
                key={pendingReminder.id}
                reminderId={pendingReminder.id}
                onRated={advance}
                onUndone={() => restore(reviewing)}
                shortcuts
              />
              <p className="text-xs text-muted-foreground">
                Rates your recall this time, not the note's Easy/Medium/Hard label. Press 1–4 to
                rate.
              </p>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
