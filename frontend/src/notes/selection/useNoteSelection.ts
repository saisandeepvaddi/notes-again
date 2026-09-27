import { useRef, useState } from "react";

export function useNoteSelection(orderedIds: number[]) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const anchor = useRef<number | null>(null);

  const toggle = (id: number, range = false) => {
    setSelected((current) => {
      const next = new Set(current);
      const from = anchor.current === null ? -1 : orderedIds.indexOf(anchor.current);
      const to = orderedIds.indexOf(id);
      if (range && from !== -1 && to !== -1) {
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
    selectionMode: selected.size > 0,
    isSelected: (id: number) => selected.has(id),
    ids: () => [...selected],
    toggle,
    replace,
    clear,
  };
}

export type NoteSelection = ReturnType<typeof useNoteSelection>;
