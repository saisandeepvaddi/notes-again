import {
  applyNoteAlign,
  applyNoteBorder,
  getStoredNoteAlign,
  getStoredNoteBorder,
  storeNoteAlign,
  storeNoteBorder,
  type NoteAlign,
} from "@/lib/noteLayout";
import { useEffect, useState } from "react";

export function useNoteLayout() {
  const [align, setAlign] = useState<NoteAlign>("center");
  const [border, setBorder] = useState(false);

  useEffect(() => {
    setAlign(getStoredNoteAlign());
    setBorder(getStoredNoteBorder());
  }, []);

  const chooseAlign = (next: NoteAlign) => {
    setAlign(next);
    storeNoteAlign(next);
    applyNoteAlign(next);
  };

  const chooseBorder = (next: boolean) => {
    setBorder(next);
    storeNoteBorder(next);
    applyNoteBorder(next);
  };

  return { align, chooseAlign, border, chooseBorder };
}
