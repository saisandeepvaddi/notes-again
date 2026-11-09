export interface NoteText {
  name: string;
  content: string;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export function createNoteSaveQueue(
  initial: NoteText,
  save: (text: NoteText) => Promise<unknown>,
  onStatus: (status: SaveStatus) => void,
) {
  let latest = { ...initial };
  let saved = { ...initial };
  let inFlight: Promise<unknown> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const current = () => ({ name: latest.name.trim() || saved.name, content: latest.content });
  const same = (a: NoteText, b: NoteText) => a.name === b.name && a.content === b.content;
  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const flush = async () => {
    clearTimer();
    for (;;) {
      if (inFlight) {
        await inFlight;
        continue;
      }
      const next = current();
      if (same(next, saved)) return;
      onStatus("saving");
      const request = save(next);
      inFlight = request;
      try {
        await request;
        saved = next;
        onStatus(same(current(), saved) ? "saved" : "pending");
      } catch (error) {
        onStatus("error");
        throw error;
      } finally {
        if (inFlight === request) inFlight = null;
      }
    }
  };

  return {
    flush,
    update: (patch: Partial<NoteText>) => {
      latest = { ...latest, ...patch };
      clearTimer();
      if (same(current(), saved) && !inFlight) {
        onStatus("idle");
        return;
      }
      onStatus("pending");
      timer = setTimeout(() => void flush().catch(() => undefined), 800);
    },
  };
}
