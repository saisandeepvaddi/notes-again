import { ReviewSkeleton } from "@/components/PageSkeletons";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, SkipForwardIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNoteIntervals } from "../hooks/useNoteIntervals";
import { NoteContent } from "../NoteContent";
import { NoteTitle } from "../NoteTitle";
import { RatingButtons } from "../RatingButtons";
import { RATING_DOT_CLASSES, RATING_OPTIONS } from "../rating";
import type { NoteItem, Rating } from "../new-note-form/types";
import { fetchDueNotes, useDueNotes } from "../notes-list/useDueNotes";

function SessionProgress({
  reviewed,
  remaining,
  onEnd,
}: {
  reviewed: number;
  remaining: number;
  onEnd: () => void;
}) {
  const total = reviewed + remaining;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums">
        <span>
          {reviewed.toLocaleString()} of {total.toLocaleString()} reviewed
        </span>
        <div className="flex items-center gap-3">
          <span>{remaining.toLocaleString()} left</span>
          {remaining > 0 && (
            <button
              type="button"
              onClick={onEnd}
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              End session
            </button>
          )}
        </div>
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
  const [tallies, setTallies] = useState<Record<Rating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [endedEarly, setEndedEarly] = useState(false);
  const current = queue[0];
  const pendingReminder = current?.reminders.find((reminder) => reminder.reviewed_at === null);
  const { data: intervals } = useNoteIntervals(current?.id ?? 0, Boolean(pendingReminder));

  const advance = async (rating: Rating) => {
    setReviewedCount((count) => count + 1);
    setTallies((counts) => ({ ...counts, [rating]: counts[rating] + 1 }));
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

  const skip = () => {
    if (queue.length < 2) return;
    setQueue((notes) => [...notes.slice(1), notes[0]]);
  };

  const endSession = () => {
    setEndedEarly(true);
    setQueue([]);
  };

  const restore = (note: NoteItem, rating?: Rating) => {
    setQueue((notes) => [note, ...notes.filter((n) => n.id !== note.id)]);
    setRemaining((count) => count + 1);
    setReviewedCount((count) => Math.max(0, count - 1));
    if (rating) {
      setTallies((counts) => ({ ...counts, [rating]: Math.max(0, counts[rating] - 1) }));
    }
  };

  if (loadingMore) {
    return <ReviewSkeleton />;
  }

  if (!current) {
    const rated = RATING_OPTIONS.filter((option) => tallies[option.value] > 0);
    return (
      <div className="mx-auto flex min-h-[60dvh] w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none">
        <CheckCircleIcon className="size-8 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-reading text-lg font-semibold tracking-tight">
            {endedEarly
              ? "Session paused"
              : reviewedCount > 0
                ? "Session complete"
                : "All caught up"}
          </p>
          <p className="text-sm text-muted-foreground">
            {endedEarly
              ? `Reviewed ${reviewedCount.toLocaleString()} note${reviewedCount === 1 ? "" : "s"}. ${remaining.toLocaleString()} remain due for whenever you're ready.`
              : reviewedCount > 0
                ? `Reviewed ${reviewedCount.toLocaleString()} note${reviewedCount === 1 ? "" : "s"} in this session.`
                : "Nothing's due right now. Check back later."}
          </p>
        </div>
        {rated.length > 0 && (
          <dl className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
            {rated.map((option) => (
              <div key={option.value} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", RATING_DOT_CLASSES[option.value])}
                />
                <dt className="text-muted-foreground">{option.label}</dt>
                <dd className="font-medium tabular-nums">{tallies[option.value]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  }

  const reviewing = current;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col gap-4 pb-2 md:justify-center">
      <SessionProgress reviewed={reviewedCount} remaining={remaining} onEnd={endSession} />
      <article className="flex flex-col gap-4 rounded-lg bg-card p-5 ring-1 ring-foreground/10 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-reading text-xl font-semibold tracking-tight">
            <NoteTitle title={current.name} />
          </h2>
          {queue.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={skip}
              className="shrink-0 text-muted-foreground"
            >
              <SkipForwardIcon /> Skip
            </Button>
          )}
        </div>
        <NoteContent markdown={current.content} />
      </article>
      {pendingReminder && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-2 border-t bg-background/95 px-4 pt-4 pb-3 backdrop-blur-sm md:mt-0">
          <p className="text-sm font-medium">How well did you remember this?</p>
          <RatingButtons
            key={pendingReminder.id}
            reminderId={pendingReminder.id}
            intervals={intervals}
            onRated={advance}
            onUndone={(rating) => restore(reviewing, rating)}
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
