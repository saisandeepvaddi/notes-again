import { ClientOnly } from "@tanstack/react-router";
import { ReviewCalendar } from "./ReviewCalendar";

export function ReviewCalendarContainer() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <ClientOnly fallback={<>Loading calendar...</>}>
        <ReviewCalendar />
      </ClientOnly>
    </div>
  );
}
