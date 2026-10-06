import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileTextIcon, PauseIcon, RepeatIcon } from "lucide-react";
import { REVIEW_STATUSES, REVIEW_STATUS_LABELS, type ReviewStatus } from "./reviewStatus";

export const REVIEW_STATUS_ICONS = {
  active: RepeatIcon,
  paused: PauseIcon,
  "note-only": FileTextIcon,
} satisfies Record<ReviewStatus, unknown>;

export function ReviewStatusPicker({
  value,
  onChange,
  disabled = false,
  label = "Review status",
}: {
  value: ReviewStatus;
  onChange: (status: ReviewStatus) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      className="flex w-fit items-center gap-0.5 rounded-md border p-0.5"
      role="radiogroup"
      aria-label={label}
    >
      {REVIEW_STATUSES.map((status) => {
        const Icon = REVIEW_STATUS_ICONS[status];
        const selected = value === status;
        return (
          <Button
            key={status}
            type="button"
            size="sm"
            variant="ghost"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={cn(selected && "bg-muted text-foreground")}
            onClick={() => {
              if (!selected) onChange(status);
            }}
          >
            <Icon /> {REVIEW_STATUS_LABELS[status]}
          </Button>
        );
      })}
    </div>
  );
}
