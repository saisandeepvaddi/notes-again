export type NoteAlign = "center" | "left" | "full";

const ALIGN_KEY = "note-align";
const BORDER_KEY = "note-border";

const isNoteAlign = (value: string | null): value is NoteAlign =>
  value === "center" || value === "left" || value === "full";

export function getStoredNoteAlign(): NoteAlign {
  try {
    const value = window.localStorage.getItem(ALIGN_KEY);
    if (isNoteAlign(value)) return value;
  } catch {}
  return "center";
}

export function storeNoteAlign(align: NoteAlign) {
  try {
    window.localStorage.setItem(ALIGN_KEY, align);
  } catch {}
}

export function applyNoteAlign(align: NoteAlign) {
  document.documentElement.dataset.noteAlign = align;
}

export function getStoredNoteBorder(): boolean {
  try {
    return window.localStorage.getItem(BORDER_KEY) === "on";
  } catch {}
  return false;
}

export function storeNoteBorder(border: boolean) {
  try {
    window.localStorage.setItem(BORDER_KEY, border ? "on" : "off");
  } catch {}
}

export function applyNoteBorder(border: boolean) {
  document.documentElement.dataset.noteBorder = border ? "on" : "off";
}

export const NOTE_LAYOUT_INIT_SCRIPT = `(function(){try{var d=document.documentElement.dataset,a=localStorage.getItem("${ALIGN_KEY}");d.noteAlign=a==="left"||a==="full"?a:"center";d.noteBorder=localStorage.getItem("${BORDER_KEY}")==="on"?"on":"off";}catch(e){}})();`;
