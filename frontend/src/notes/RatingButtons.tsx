import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "./difficulty";
import { useUpdateReminder } from "./hooks/useUpdateReminder";
import type { Difficulty } from "./new-note-form/types";

interface RatingButtonsProps {
  reminderId: number;
  currentDifficulty?: Difficulty;
  onRated?: () => void;
  className?: string;
}

export function RatingButtons({
  reminderId,
  currentDifficulty,
  onRated,
  className,
}: RatingButtonsProps) {
  const { mutateAsync, isPending } = useUpdateReminder({ reminderId });

  const rate = async (difficulty: Difficulty) => {
    try {
      await mutateAsync({ action: "review", rating: difficulty });
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
    <div className={cn("flex gap-2", className)}>
      {DIFFICULTY_OPTIONS.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => rate(option.value)}
          className={cn(
            currentDifficulty === option.value && DIFFICULTY_BADGE_CLASSES[option.value],
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
