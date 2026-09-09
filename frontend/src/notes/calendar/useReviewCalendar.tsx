import { getFetcher } from "@/utils/fetchers";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const CalendarDaySchema = z.object({
  date: z.string(),
  due: z.number(),
  overdue: z.number(),
  reviewed: z.number(),
});

export type CalendarDay = z.infer<typeof CalendarDaySchema>;

const CalendarResponseSchema = z.record(z.string(), CalendarDaySchema);

export function useReviewCalendar(start: Date, end: Date) {
  const tzOffsetMinutes = start.getTimezoneOffset();
  return useQuery({
    queryKey: ["notes-calendar", start.toISOString(), end.toISOString()],
    queryFn: () =>
      getFetcher(
        `/notes/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&tz_offset_minutes=${tzOffsetMinutes}`,
      )().then((data) => CalendarResponseSchema.parse(data)),
  });
}
