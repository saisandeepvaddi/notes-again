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
    <div className="flex w-full flex-col gap-2">
      <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
        {RATING_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => rate(option.value)}
            className={cn("h-auto flex-col gap-0 py-1.5", RATING_BADGE_CLASSES[option.value])}
          >
            <span className="font-medium">{option.label}</span>
            <span className="text-[10px] font-normal">{option.caption}</span>
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Rates your recall this time, not the note's Easy/Medium/Hard label.
      </p>
    </div>
  );
}
