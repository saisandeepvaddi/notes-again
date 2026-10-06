import { ReviewSkeleton } from "@/components/PageSkeletons";
import { toast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircleIcon } from "@phosphor-icons/react";
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
    return <ReviewSkeleton />;
  }

  if (!current) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2 px-6 py-16 text-center animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none">
        <CheckCircleIcon className="size-8 text-primary" aria-hidden="true" />
        <p className="font-heading text-lg font-semibold tracking-tight">
          {reviewedCount > 0 ? "Session complete" : "All caught up"}
        </p>
        <p className="text-sm text-muted-foreground">
          {reviewedCount > 0
            ? `Reviewed ${reviewedCount.toLocaleString()} note${reviewedCount === 1 ? "" : "s"}. Nothing else is due right now.`
            : "Nothing's due right now. Check back later."}
        </p>
      </div>
    );
  }

  const reviewing = current;
  const pendingReminder = current.reminders.find((reminder) => reminder.reviewed_at === null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <SessionProgress reviewed={reviewedCount} remaining={remaining} />
      <article className="flex flex-col gap-4 py-2">
        <h2 className="font-reading text-xl font-semibold tracking-tight">
          <NoteTitle title={current.name} />
        </h2>
        <NoteContent markdown={current.content} />
      </article>
      {pendingReminder && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 border-t bg-background/95 px-1 pt-4 pb-3 backdrop-blur-sm">
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
