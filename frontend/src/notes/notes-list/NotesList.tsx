import {
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
} from "@mdxeditor/editor";
import { useNotes } from "./useNotes";

function NotesList() {
  const { data: notes } = useNotes();
  return (
    <div>
      {notes.map((note) => (
        <div key={note.id}>
          <h2>{note.name}</h2>
          <MDXEditor
            contentEditableClassName="prose"
            markdown={note.content}
            readOnly
            plugins={[
              headingsPlugin(),
              listsPlugin(),
              quotePlugin(),
              thematicBreakPlugin(),
              markdownShortcutPlugin(),
              linkPlugin(),
              linkDialogPlugin(),
              codeBlockPlugin({ defaultCodeBlockLanguage: "python" }),
              codeMirrorPlugin({
                codeBlockLanguages: {
                  js: "JavaScript",
                  css: "CSS",
                  txt: "text",
                  tsx: "TypeScript",
                },
              }),
            ]}
          />
        </div>
      ))}
    </div>
  );
}

export default NotesList;
