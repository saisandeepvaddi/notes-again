import { markdownExcerpt } from "@web/notes/markdownExcerpt";
import type { NoteItem } from "@web/notes/new-note-form/types";
import { formatDistanceToNowStrict, isToday, isTomorrow, format } from "date-fns";
import { pendingReminder } from "@/api/notes";

export const noteTitle = (note: Pick<NoteItem, "name">) =>
  markdownExcerpt(note.name, 200) || "Untitled";

export const noteExcerpt = (note: Pick<NoteItem, "content">) => markdownExcerpt(note.content, 160);

export function dueLabel(note: NoteItem, now = new Date()): { text: string; due: boolean } {
  if (!note.in_review) return { text: "Note only", due: false };
  if (note.paused_at) return { text: "Paused", due: false };
  const pending = pendingReminder(note);
  if (!pending) return { text: "Not scheduled", due: false };
  const at = pending.remind_at;
  if (at <= now) return { text: "Due now", due: true };
  if (isToday(at)) return { text: `Due at ${format(at, "p")}`, due: false };
  if (isTomorrow(at)) return { text: "Due tomorrow", due: false };
  return {
    text: `Due in ${formatDistanceToNowStrict(at, { roundingMethod: "ceil" })}`,
    due: false,
  };
}

export const formatCount = (count: number) =>
  count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
