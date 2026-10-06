export type ReadingFont = "sans" | "serif";

const STORAGE_KEY = "reading-font";

export function getStoredReadingFont(): ReadingFont {
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "serif") {
      return "serif";
    }
  } catch {}
  return "sans";
}

export function storeReadingFont(font: ReadingFont) {
  try {
    window.localStorage.setItem(STORAGE_KEY, font);
  } catch {}
}

export function applyReadingFont(font: ReadingFont) {
  document.documentElement.dataset.readingFont = font;
}

export const READING_FONT_INIT_SCRIPT = `(function(){try{document.documentElement.dataset.readingFont=localStorage.getItem("${STORAGE_KEY}")==="serif"?"serif":"sans";}catch(e){}})();`;
