import {
  applyReadingFont,
  getStoredReadingFont,
  storeReadingFont,
  type ReadingFont,
} from "@/lib/readingFont";
import { useEffect, useState } from "react";

export function useReadingFont() {
  const [font, setFont] = useState<ReadingFont>("sans");

  useEffect(() => {
    setFont(getStoredReadingFont());
  }, []);

  const choose = (next: ReadingFont) => {
    setFont(next);
    storeReadingFont(next);
    applyReadingFont(next);
  };

  return [font, choose] as const;
}
