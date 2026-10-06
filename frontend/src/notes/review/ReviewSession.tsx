import { Card, CardContent, CardHeader } from "@/components/ui/card";
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

function SessionProgress({ reviewed, remaining }: { reviewed: number; remaining: number }) {
  const total = reviewed + remaining;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          {reviewed.toLocaleString()} of {total.toLocaleString()} reviewed
        </span>
        <span>{remaining.toLocaleString()} left</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-left bg-primary transition-transform duration-300 motion-reduce:transition-none"
          style={{ transform: `scaleX(${total > 0 ? reviewed / total : 0})` }}
        />
      </div>
    </div>
  );
}

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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <SessionProgress reviewed={reviewedCount} remaining={remaining} />
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
      <Card className="mx-auto w-full max-w-2xl items-center gap-2 px-6 py-12 text-center animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none">
        <CheckCircle2Icon className="size-8 text-primary" aria-hidden="true" />
        <p className="font-serif text-lg font-semibold">
          {reviewedCount > 0 ? "Session complete" : "All caught up"}
        </p>
        <p className="text-sm text-muted-foreground">
          {reviewedCount > 0
            ? `Reviewed ${reviewedCount.toLocaleString()} note${reviewedCount === 1 ? "" : "s"}. Nothing else is due right now.`
            : "Nothing's due right now. Check back later."}
        </p>
      </Card>
    );
  }

  const reviewing = current;
  const pendingReminder = current.reminders.find((reminder) => reminder.reviewed_at === null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <SessionProgress reviewed={reviewedCount} remaining={remaining} />
      <Card>
        <CardHeader className="font-serif font-semibold text-xl">
          <NoteTitle title={current.name} />
        </CardHeader>
        <CardContent>
          <NoteContent markdown={current.content} />
        </CardContent>
      </Card>
      {pendingReminder && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 bg-background/95 px-1 pt-1 pb-3 backdrop-blur-sm">
          <p className="text-sm font-medium">How well did you remember this?</p>
          <RatingButtons
            key={pendingReminder.id}
            reminderId={pendingReminder.id}
            onRated={advance}
            onUndone={() => restore(reviewing)}
            shortcuts
          />
          <p className="text-xs text-muted-foreground">
            Rates your recall this time, not the note's Easy/Medium/Hard label.
            <span className="[@media(pointer:coarse)]:hidden"> Press 1-4 to rate.</span>
          </p>
        </div>
      )}
    </div>
  );
}
