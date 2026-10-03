export type BlockKind = "paragraph" | "quote" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "";
export type ListKind = "bullet" | "number" | "check" | "";

export interface FormatState {
  bold: boolean;
  italic: boolean;
  code: boolean;
  block: BlockKind;
  list: ListKind;
  link: LinkInfo | null;
  selectionText: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface LinkInfo {
  url: string;
  text: string;
}

export const EMPTY_FORMAT: FormatState = {
  bold: false,
  italic: false,
  code: false,
  block: "paragraph",
  list: "",
  link: null,
  selectionText: "",
  canUndo: false,
  canRedo: false,
};

export interface CaretRect {
  top: number;
  bottom: number;
}

export interface RichEditorHandle {
  format: (kind: "bold" | "italic" | "code") => void;
  block: (kind: BlockKind) => void;
  list: (kind: ListKind) => void;
  codeBlock: () => void;
  saveLink: (text: string, url: string) => void;
  removeLink: () => void;
  undo: () => void;
  redo: () => void;
  indent: (direction: number) => void;
  focus: () => void;
  blur: () => void;
}
