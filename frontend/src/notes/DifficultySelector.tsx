import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "./difficulty";
import { useSetDifficulty } from "./hooks/useSetDifficulty";
import type { Difficulty } from "./new-note-form/types";

interface DifficultySelectorProps {
  noteId: number;
  difficulty: Difficulty;
}

export function DifficultySelector({ noteId, difficulty }: DifficultySelectorProps) {
  const { mutateAsync, isPending } = useSetDifficulty({ noteId });
  const [open, setOpen] = useState(false);

  const setDifficulty = async (value: Difficulty) => {
    setOpen(false);
    if (value === difficulty) return;
    try {
      await mutateAsync(value);
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to update difficulty" });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Badge
            variant="outline"
            className={cn("cursor-pointer capitalize", DIFFICULTY_BADGE_CLASSES[difficulty])}
          >
            {difficulty}
          </Badge>
        }
      />
      <PopoverContent className="w-28 p-1">
        <div className="flex flex-col gap-0.5">
          {DIFFICULTY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={isPending}
              onClick={() => setDifficulty(option.value)}
              className={cn(
                "rounded-md px-2 py-1 text-left text-xs/relaxed hover:bg-muted",
                option.value === difficulty && "font-semibold",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
