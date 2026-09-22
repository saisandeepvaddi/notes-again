import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { SUCCESS_DOT_CLASSES, WARNING_TINT_CLASSES } from "@/lib/statusColors";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { useState } from "react";
import type { DayButtonProps } from "react-day-picker";
import { useReviewCalendar, type CalendarDay } from "./useReviewCalendar";

interface DayButtonWithInfoProps extends DayButtonProps {
  calendarData: Record<string, CalendarDay>;
}

function DayButtonWithInfo({
  day,
  modifiers,
  calendarData,
  children,
  ...props
}: DayButtonWithInfoProps) {
  const info = calendarData[format(day.date, "yyyy-MM-dd")];
  const totalToday = (info?.due ?? 0) + (info?.overdue ?? 0);

  return (
    <CalendarDayButton day={day} modifiers={modifiers} {...props}>
      {children}
      {info && (
        <span className="flex items-center justify-center gap-0.5">
          {modifiers.today
            ? totalToday > 0 && (
                <span
                  className={cn(
                    "rounded px-1 text-[0.625rem] font-medium",
                    info.overdue > 0
                      ? "bg-destructive/15 text-destructive"
                      : WARNING_TINT_CLASSES,
                  )}
                >
                  {totalToday}
                </span>
              )
            : info.due > 0 && (
                <span
                  className={cn(
                    "rounded px-1 text-[0.625rem] font-medium",
                    WARNING_TINT_CLASSES,
                  )}
                >
                  {info.due}
                </span>
              )}
          {info.reviewed > 0 && (
            <span className={cn("size-1 rounded-full", SUCCESS_DOT_CLASSES)} />
          )}
        </span>
      )}
    </CalendarDayButton>
  );
}

export function ReviewCalendar() {
  const [month, setMonth] = useState(new Date());
  const navigate = useNavigate();

  const rangeStart = startOfWeek(startOfMonth(month));
  const rangeEndInclusive = endOfWeek(endOfMonth(month));
  const rangeEnd = new Date(rangeEndInclusive);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  const { data: calendarData = {} } = useReviewCalendar(rangeStart, rangeEnd);

  return (
    <Calendar
      month={month}
      onMonthChange={setMonth}
      // react-day-picker only renders through components.DayButton (and wires
      // up click handling) when it considers days "interactive," which
      // requires a mode or onDayClick prop here at the DayPicker level.
      onDayClick={(date) => navigate({ to: "/notes", search: (prev) => ({ ...prev, date }) })}
      // 64px cells (7 columns = 448px+) overflow a phone-width viewport --
      // shrink at narrow widths, grow back at sm/md like the original.
      className="w-full max-w-4xl [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(13)] md:[--cell-size:--spacing(16)]"
      classNames={{ root: "w-full", month: "w-full", month_grid: "w-full" }}
      components={{
        DayButton: (props) => <DayButtonWithInfo {...props} calendarData={calendarData} />,
      }}
    />
  );
}
