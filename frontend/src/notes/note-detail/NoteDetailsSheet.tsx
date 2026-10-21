import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { InfoIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import type { NoteItem } from "../new-note-form/types";
import { RATING_BADGE_CLASSES, RATING_OPTIONS } from "../rating";

const ratingOption = (rating: string | null) =>
  RATING_OPTIONS.find((option) => option.value === rating);

export function NoteDetailsSheet({ note }: { note: NoteItem }) {
  const reviews = note.reminders
    .filter((reminder) => reminder.reviewed_at !== null)
    .sort((a, b) => (b.reviewed_at?.getTime() ?? 0) - (a.reviewed_at?.getTime() ?? 0));

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label="Note details" title="Note details">
            <InfoIcon />
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader className="pb-4">
          <SheetTitle>Note details</SheetTitle>
          <SheetDescription>When this note was written and how its reviews went.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-right tabular-nums" title={format(note.created_at, "PPpp")}>
              {format(note.created_at, "MMM d, yyyy")}
            </dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="text-right tabular-nums" title={format(note.updated_at, "PPpp")}>
              {format(note.updated_at, "MMM d, yyyy")}
            </dd>
          </dl>
          <Separator />
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-heading text-sm font-medium">Review history</h3>
              {reviews.length > 0 && (
                <span className="text-muted-foreground tabular-nums">{reviews.length}</span>
              )}
            </div>
            {reviews.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {reviews.map((reminder) => {
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
            ) : (
              <p className="text-muted-foreground">No reviews yet.</p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
