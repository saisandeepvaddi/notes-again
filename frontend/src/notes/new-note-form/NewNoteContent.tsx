import {
  BoldItalicUnderlineToggles,
  headingsPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
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
            <MDXEditor
              // className="border min-w-1/2 min-h-1/2"
              markdown={"# Hello World"}
              plugins={[
                toolbarPlugin({
                  toolbarClassName: "my-classname",
                  toolbarContents: () => (
                    <>
                      <UndoRedo />
                      <BoldItalicUnderlineToggles />
                    </>
                  ),
                }),
                headingsPlugin(),
                listsPlugin(),
                quotePlugin(),
                thematicBreakPlugin(),
                markdownShortcutPlugin(),
              ]}
              onChange={(value) => field.handleChange(value)}
            />
          );
        }}
      />
    );
  },
});

export default NewNoteContent;
