import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { useState } from "react";
import type { NoteItem } from "../new-note-form/types";
import { RATING_BADGE_CLASSES, RATING_OPTIONS } from "../rating";

const VISIBLE_REVIEWS = 5;

const ratingOption = (rating: string | null) =>
  RATING_OPTIONS.find((option) => option.value === rating);

export function NoteMetadata({ note }: { note: NoteItem }) {
  const [showAll, setShowAll] = useState(false);
  const reviews = note.reminders
    .filter((reminder) => reminder.reviewed_at !== null)
    .sort((a, b) => (b.reviewed_at?.getTime() ?? 0) - (a.reviewed_at?.getTime() ?? 0));
  const visibleReviews = showAll ? reviews : reviews.slice(0, VISIBLE_REVIEWS);

  return (
    <aside
      className="flex min-w-0 flex-col gap-5 text-xs lg:sticky lg:top-6 lg:self-start"
      aria-label="Note details"
    >
      <section className="flex flex-col gap-3">
        <h2 className="font-reading text-sm font-semibold">Details</h2>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">Algorithm</dt>
          <dd className="text-right font-medium uppercase" title="Scheduling algorithm">
            {note.algorithm}
          </dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd className="text-right tabular-nums" title={format(note.created_at, "PPpp")}>
            {format(note.created_at, "MMM d, yyyy")}
          </dd>
          <dt className="text-muted-foreground">Updated</dt>
          <dd className="text-right tabular-nums" title={format(note.updated_at, "PPpp")}>
            {format(note.updated_at, "MMM d, yyyy")}
          </dd>
        </dl>
      </section>
      <Separator />
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-reading text-sm font-semibold">Review history</h2>
          {reviews.length > 0 && (
            <span className="text-muted-foreground tabular-nums">{reviews.length}</span>
          )}
        </div>
        {reviews.length > 0 ? (
          <>
            <ol className="flex flex-col gap-2">
              {visibleReviews.map((reminder) => {
                const option = ratingOption(reminder.rating);
                return (
                  <li key={reminder.id} className="flex items-center justify-between gap-2">
                    {option ? (
                      <Badge variant="secondary" className={RATING_BADGE_CLASSES[option.value]}>
                        {option.label}
                      </Badge>
                    ) : (
                      <span>Reviewed</span>
                    )}
                    <time
                      dateTime={reminder.reviewed_at?.toISOString()}
                      title={
                        reminder.reviewed_at ? format(reminder.reviewed_at, "PPpp") : undefined
                      }
                      className="text-muted-foreground tabular-nums"
                    >
                      {reminder.reviewed_at ? format(reminder.reviewed_at, "MMM d, yyyy") : ""}
                    </time>
                  </li>
                );
              })}
            </ol>
            {reviews.length > VISIBLE_REVIEWS && (
              <Button
                size="xs"
                variant="ghost"
                className="-ml-2 self-start text-muted-foreground"
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll ? "Show fewer" : `Show all ${reviews.length}`}
              </Button>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No reviews yet.</p>
        )}
      </section>
    </aside>
  );
}
