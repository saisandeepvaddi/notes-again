import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Rating } from "./new-note-form/types";
import { useUpdateReminder } from "./hooks/useUpdateReminder";

interface RatingButtonsProps {
  reminderId: number;
  onRated?: () => void;
  className?: string;
}

const RATINGS: {
  value: Rating;
  label: string;
  variant: React.ComponentProps<typeof Button>["variant"];
}[] = [
  { value: "again", label: "Again", variant: "destructive" },
  { value: "hard", label: "Hard", variant: "outline" },
  { value: "good", label: "Good", variant: "default" },
  { value: "easy", label: "Easy", variant: "secondary" },
];

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
    <div className={cn("flex gap-2", className)}>
      {RATINGS.map((rating) => (
        <Button
          key={rating.value}
          size="sm"
          variant={rating.variant}
          disabled={isPending}
          onClick={() => rate(rating.value)}
        >
          {rating.label}
        </Button>
      ))}
    </div>
  );
}
