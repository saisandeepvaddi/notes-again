import { EditorView } from "@codemirror/view";

// CodeMirror's default theme is hardcoded light (white background, near-black
// text via literal rgb() values) -- it doesn't know about our app's
// light/dark mode at all. Re-theme the editor chrome (not the syntax
// highlighting token colors, which read fine as-is) using our own CSS
// variables so it tracks whichever theme is active instead of always
// rendering a white box.
export const codeMirrorTheme = EditorView.theme({
  // Transparent: the code block wrapper (styles.css) owns the fill.
  "&": {
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
