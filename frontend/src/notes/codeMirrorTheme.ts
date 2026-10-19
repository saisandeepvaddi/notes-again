import { EditorView } from "@codemirror/view";

export const codeMirrorTheme = EditorView.theme({
  "&": {
    maxWidth: "100%",
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--accent)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
});
