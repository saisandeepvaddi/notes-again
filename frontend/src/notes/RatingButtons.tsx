import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useUpdateReminder } from "./hooks/useUpdateReminder";
import type { Rating } from "./new-note-form/types";
import { RATING_BADGE_CLASSES, RATING_OPTIONS } from "./rating";

interface RatingButtonsProps {
  reminderId: number;
  onRated?: () => void;
  className?: string;
}

// A rating is a momentary per-review action, not a sticky note attribute --
// unlike the old difficulty-based buttons, there's no "current" value to
// highlight, so every button is always tinted by its own rating.
export function RatingButtons({ reminderId, onRated, className }: RatingButtonsProps) {
  const { mutateAsync, isPending } = useUpdateReminder({ reminderId });

  const rate = async (rating: Rating) => {
    try {
      await mutateAsync({ action: "review", rating });
      onRated?.();
    } catch (error) {
      console.error("error:", error);
      toast.add({
        type: "error",
        priority: "high",
        description: "Failed to update",
      });
    }
  };

  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {RATING_OPTIONS.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => rate(option.value)}
          className={RATING_BADGE_CLASSES[option.value]}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
