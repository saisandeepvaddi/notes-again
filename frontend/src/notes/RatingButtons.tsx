import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useEffectEvent, useRef } from "react";
import { useRateReminder } from "./hooks/useRateReminder";
import type { Rating } from "./new-note-form/types";
import { RATING_BADGE_CLASSES, RATING_OPTIONS } from "./rating";

interface RatingButtonsProps {
  reminderId: number;
  intervals?: Partial<Record<Rating, Date>>;
  onRated?: (rating: Rating) => void;
  onUndone?: (rating: Rating | undefined) => void;
  shortcuts?: boolean;
  className?: string;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function RatingButtons({
  reminderId,
  intervals,
  onRated,
  onUndone,
  shortcuts = false,
  className,
}: RatingButtonsProps) {
  const lastRated = useRef<Rating | undefined>(undefined);
  const { rate, isPending } = useRateReminder({
    reminderId,
    onUndone: () => {
      onUndone?.(lastRated.current);
      lastRated.current = undefined;
    },
  });
  const submitting = useRef(false);

  const submit = async (rating: Rating) => {
    if (submitting.current) return;
    submitting.current = true;
    const rated = await rate(rating);
    if (rated) {
      lastRated.current = rating;
      onRated?.(rating);
    } else {
      submitting.current = false;
    }
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const option = RATING_OPTIONS[Number(event.key) - 1];
    if (!option) return;
    event.preventDefault();
    submit(option.value);
  });

  useEffect(() => {
    if (!shortcuts) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);

  return (
    <div className={cn("grid grid-cols-4 gap-1.5", className)}>
      {RATING_OPTIONS.map((option, index) => (
        <Button
          key={option.value}
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => submit(option.value)}
          aria-keyshortcuts={shortcuts ? String(index + 1) : undefined}
          className={cn(
            "relative h-auto flex-col gap-0 px-1 py-2",
            RATING_BADGE_CLASSES[option.value],
          )}
        >
          {shortcuts && (
            <kbd className="absolute top-1 right-1.5 font-sans text-[10px] font-medium tabular-nums opacity-60 [@media(pointer:coarse)]:hidden">
              {index + 1}
            </kbd>
          )}
          <span className="font-medium">{option.label}</span>
          <span className="text-[10px] font-normal">
            {intervals?.[option.value]
              ? formatDistanceToNowStrict(intervals[option.value] as Date)
              : option.caption}
          </span>
        </Button>
      ))}
    </div>
  );
}
