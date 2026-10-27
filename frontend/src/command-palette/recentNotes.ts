const STORAGE_KEY = "recent-notes";
const MAX_RECENT = 8;

export interface RecentNote {
  id: number;
  title: string;
}

export function getRecentNotes(): RecentNote[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentNote => typeof item?.id === "number" && typeof item?.title === "string",
    );
  } catch {
    return [];
  }
}

function store(notes: RecentNote[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes.slice(0, MAX_RECENT)));
  } catch {}
}

export function rememberRecentNote(note: RecentNote) {
  store([note, ...getRecentNotes().filter((item) => item.id !== note.id)]);
}

export function forgetRecentNote(id: number) {
  store(getRecentNotes().filter((item) => item.id !== id));
}
