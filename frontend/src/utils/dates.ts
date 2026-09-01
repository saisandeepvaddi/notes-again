import { UTCDate } from "@date-fns/utc";
import { addDays } from "date-fns";
const DEFAULT_SPACED_REP_DAYS = [0, 1, 3, 7, 14, 30, 60];
export const getDefaultReminderDates = (reminderDays = DEFAULT_SPACED_REP_DAYS) => {
  const today = new UTCDate();
  return reminderDays.map((days) => addDays(today, days));
};
