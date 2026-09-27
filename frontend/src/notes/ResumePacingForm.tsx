import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { DEFAULT_RESUME_PER_DAY } from "./hooks/usePausing";

export function ResumePacingForm({
  isPending,
  onResume,
}: {
  isPending: boolean;
  onResume: (perDay: number) => void;
}) {
  const [perDay, setPerDay] = useState(String(DEFAULT_RESUME_PER_DAY));
  const perDayNumber = Number.parseInt(perDay, 10);
  const valid = Number.isInteger(perDayNumber) && perDayNumber >= 0 && perDayNumber <= 1000;

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onResume(perDayNumber);
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">New notes per day</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={1000}
          value={perDay}
          onChange={(event) => setPerDay(event.target.value)}
          aria-invalid={!valid}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Never-reviewed notes come back this many a day; 0 makes them all due now. Notes you've
        reviewed before keep their schedule.
      </p>
      <Button type="submit" size="sm" disabled={isPending || !valid}>
        {isPending ? <Spinner /> : <PlayIcon />} Resume
      </Button>
    </form>
  );
}
