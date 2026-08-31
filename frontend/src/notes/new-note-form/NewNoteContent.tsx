import {
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

import { newNoteFormOptions, withForm } from "./new-note-form-utils";

export const NewNoteContent = withForm({
  ...newNoteFormOptions,
  render: function Render({ form }) {
    return (
      <form.AppField
        name="content"
        children={(field) => {
          return (
            <div className="border min-w-1/2 min-h-1/2">
              <MDXEditor
                contentEditableClassName="prose max-w-full font-sans"
                markdown={"# Hello World"}
                plugins={[
                  headingsPlugin(),
                  listsPlugin(),
                  quotePlugin(),
                  thematicBreakPlugin(),
                  markdownShortcutPlugin(),
                  linkPlugin(),
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
                onChange={(value) => field.handleChange(value)}
              />
            </div>
          );
        }}
      />
    );
  },
});

export default NewNoteContent;
