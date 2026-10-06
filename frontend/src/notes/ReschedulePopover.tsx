import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDotsIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useRescheduleReminder } from "./hooks/useRescheduleReminder";

interface ReschedulePopoverProps {
  noteId: number;
  currentRemindAt: Date;
}

export function ReschedulePopover({ noteId, currentRemindAt }: ReschedulePopoverProps) {
  const [open, setOpen] = useState(false);
  const reschedule = useRescheduleReminder({ noteId });

  function pick(date: Date | undefined) {
    if (!date) {
      return;
    }
    reschedule.mutate(date, { onSuccess: () => setOpen(false) });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="icon-sm" variant="outline" aria-label="Reschedule review">
            <CalendarDotsIcon />
          </Button>
        }
      />
      <PopoverContent className="w-auto p-2">
        <Button
          size="sm"
          variant="secondary"
          className="mb-2 w-full"
          disabled={reschedule.isPending}
          onClick={() => pick(new Date())}
        >
          Review today
        </Button>
        <Calendar mode="single" selected={currentRemindAt} onSelect={pick} />
      </PopoverContent>
    </Popover>
  );
}
