import { useRef, useState } from "react";

// Which notes are ticked, by id. Lives in the list (not in the cards/rows)
// because those are virtualized: a selected note that scrolls off-screen is
// unmounted, but must stay selected.
export function useNoteSelection(orderedIds: number[]) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  // The last note ticked/unticked, the other end of a shift-click range.
  const anchor = useRef<number | null>(null);

  const toggle = (id: number, range = false) => {
    setSelected((current) => {
      const next = new Set(current);
      const from = anchor.current === null ? -1 : orderedIds.indexOf(anchor.current);
      const to = orderedIds.indexOf(id);
      if (range && from !== -1 && to !== -1) {
        // Shift-click: extend from the anchor, matching the state the
        // clicked note is about to take (so shift-clicking a ticked note
        // unticks the span, like a file manager).
        const select = !current.has(id);
        for (const rangeId of orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          if (select) next.add(rangeId);
          else next.delete(rangeId);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    anchor.current = id;
  };

  const replace = (ids: number[]) => {
    setSelected(new Set(ids));
    anchor.current = null;
  };

  const clear = () => replace([]);

  return {
    selected,
    count: selected.size,
    // Once anything is selected, clicking a card/row toggles it instead of
    // opening the note -- the usual mail-client behavior.
    selectionMode: selected.size > 0,
    isSelected: (id: number) => selected.has(id),
    ids: () => [...selected],
    toggle,
    replace,
    clear,
  };
}

export type NoteSelection = ReturnType<typeof useNoteSelection>;
