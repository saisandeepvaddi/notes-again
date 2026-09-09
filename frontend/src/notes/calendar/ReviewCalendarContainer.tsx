import { ClientOnly } from "@tanstack/react-router";
import { ReviewCalendar } from "./ReviewCalendar";

export function ReviewCalendarContainer() {
  return (
    <ClientOnly fallback={<>Loading calendar...</>}>
      <ReviewCalendar />
    </ClientOnly>
  );
}
